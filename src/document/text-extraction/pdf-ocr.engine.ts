import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export const OCR_LIMITS = Object.freeze({ inputBytes: 10 * 1024 * 1024, outputBytes: 1024 * 1024, pages: 20, longEdge: 1754, pixels: 9000000, digitalCharacters: 30, modelBytes: 32 * 1024 * 1024 });
export const SPANISH_MODEL_SHA256 = '6cd52c545bceeacb2e43fad64fc0703a711c482ba20d1ca4b6915c09de9973e6';
export type OcrReason = 'no-added-text' | 'processing-failed' | 'invalid-input' | 'model-unavailable' | 'invalid-request';
export type OcrResult =
  | { status: 'completed'; addedText: string; pagesProcessed: number; pagesOcr: number; capped: boolean }
  | { status: 'no-enrichment'; reason: OcrReason; pagesProcessed: number; pagesOcr: number; capped: boolean };
export interface PdfPageAdapter { text(): Promise<string>; render(): Promise<Buffer>; close(): Promise<void> }
export interface PdfAdapter { pageCount: number; page(index: number): Promise<PdfPageAdapter>; close(): Promise<void> }
export interface OcrAdapter { recognize(image: Buffer): Promise<string>; close(): Promise<void> }

export function noEnrichment(reason: OcrReason): OcrResult {
  return { status: 'no-enrichment', reason, pagesProcessed: 0, pagesOcr: 0, capped: false };
}

export function normalizeText(text: string, maxBytes = OCR_LIMITS.outputBytes): string {
  const normalized = text.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\s]+/gu, ' ').trim();
  const bytes = Buffer.from(normalized, 'utf8');
  let end = Math.max(0, Math.floor(maxBytes));
  if (bytes.length <= end) return normalized;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8').trimEnd();
}

export function renderDimensions(width: number, height: number): { width: number; height: number; scale: number } {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) throw new Error('Dimensiones PDF inválidas');
  const scale = Math.min(OCR_LIMITS.longEdge / Math.max(width, height), Math.sqrt(OCR_LIMITS.pixels / width / height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}

async function quietlyClose(resource: { close(): Promise<void> }): Promise<void> {
  try { await resource.close(); } catch { /* La limpieza no publica errores ni contenido privado. */ }
}

export async function extractPdfPages(pdf: PdfAdapter, createOcr: () => Promise<OcrAdapter>): Promise<OcrResult> {
  let ocr: OcrAdapter | undefined;
  let addedText = '';
  let pagesProcessed = 0;
  let pagesOcr = 0;
  const capped = pdf.pageCount > OCR_LIMITS.pages;
  try {
    if (!Number.isInteger(pdf.pageCount) || pdf.pageCount < 1) throw new Error('PDF sin páginas');
    for (let index = 1; index <= Math.min(pdf.pageCount, OCR_LIMITS.pages); index++) {
      const page = await pdf.page(index);
      try {
        const digital = normalizeText(await page.text());
        const meaningful = digital.replace(/[^\p{L}\p{N}]/gu, '').length;
        if (meaningful < OCR_LIMITS.digitalCharacters) {
          ocr ??= await createOcr();
          const text = normalizeText(await ocr.recognize(await page.render()));
          pagesOcr++;
          if (text) addedText = normalizeText(`${addedText} ${digital} ${text}`);
        }
        pagesProcessed++;
      } finally { await quietlyClose(page); }
    }
    return addedText
      ? { status: 'completed', addedText, pagesProcessed, pagesOcr, capped }
      : { status: 'no-enrichment', reason: 'no-added-text', pagesProcessed, pagesOcr, capped };
  } catch {
    return { status: 'no-enrichment', reason: 'processing-failed', pagesProcessed, pagesOcr, capped };
  } finally {
    if (ocr) await quietlyClose(ocr);
    await quietlyClose(pdf);
  }
}

export function isLocalAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0') && isAbsolute(value) && !/^[a-z]+:\/\//i.test(value) && !value.startsWith('\\\\') && !value.startsWith('//');
}

export async function readBoundedFile(path: string, limit: number): Promise<Buffer> {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw new Error('Archivo fuera del límite');
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw new Error('Archivo modificado durante la lectura');
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}

export async function readSpanishModel(modelDirectory: string): Promise<Buffer> {
  if (!isLocalAbsolutePath(modelDirectory)) throw new Error('Ruta local requerida');
  const bytes = await readBoundedFile(join(modelDirectory, 'spa.traineddata.gz'), OCR_LIMITS.modelBytes);
  if (createHash('sha256').update(bytes).digest('hex') !== SPANISH_MODEL_SHA256) throw new Error('Modelo español no verificado');
  return bytes;
}

export function localTesseractOptions(modelDirectory: string) {
  if (!isLocalAbsolutePath(modelDirectory)) throw new Error('Ruta local requerida');
  return {
    langPath: modelDirectory,
    workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'),
    corePath: require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js'),
    cacheMethod: 'none', gzip: true, logger: () => undefined, errorHandler: () => undefined,
  };
}

async function openPdf(bytes: Buffer): Promise<PdfAdapter> {
  // Importación literal preservada: TypeScript CommonJS no debe convertir PDF.js ESM en require().
  const pdfjs = await (new Function("return import('pdfjs-dist/legacy/build/pdf.mjs')")() as Promise<any>);
  const canvasModule = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true, disableFontFace: true, verbosity: 0 });
  let document: any;
  try { document = await task.promise; } catch (error) { await task.destroy(); throw error; }
  return {
    pageCount: document.numPages,
    async page(index) {
      const page = await document.getPage(index);
      return {
        async text() {
          const content = await page.getTextContent();
          return content.items.map((item: any) => typeof item.str === 'string' ? item.str : '').join(' ');
        },
        async render() {
          const viewport = page.getViewport({ scale: 1 });
          const size = renderDimensions(viewport.width, viewport.height);
          const canvas = canvasModule.createCanvas(size.width, size.height);
          try {
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context, viewport: page.getViewport({ scale: size.scale }), background: 'rgb(255,255,255)' }).promise;
            return canvas.toBuffer('image/png');
          } finally { canvas.width = 1; canvas.height = 1; }
        },
        async close() { page.cleanup(); },
      };
    },
    async close() { await task.destroy(); },
  };
}

export async function runPdfOcr(inputPath: string, modelDirectory = resolve(process.env.OCR_MODEL_DIRECTORY || 'ocr-models')): Promise<OcrResult> {
  if (!isLocalAbsolutePath(inputPath) || !isLocalAbsolutePath(modelDirectory)) return noEnrichment('invalid-input');
  let bytes: Buffer;
  try { bytes = await readBoundedFile(inputPath, OCR_LIMITS.inputBytes); } catch { return noEnrichment('invalid-input'); }
  try { await readSpanishModel(modelDirectory); } catch { return noEnrichment('model-unavailable'); }
  try {
    const pdf = await openPdf(bytes);
    return await extractPdfPages(pdf, async () => {
      const { createWorker, OEM } = require('tesseract.js') as typeof import('tesseract.js');
      // El modelo es local, verificado y administrado por el operador; no hay descarga alternativa.
      const worker = await createWorker('spa', OEM.LSTM_ONLY, localTesseractOptions(modelDirectory));
      return {
        async recognize(image) { return (await worker.recognize(image, {}, { text: true })).data.text; },
        async close() { await worker.terminate(); },
      };
    });
  } catch { return noEnrichment('processing-failed'); }
}
