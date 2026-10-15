import { extractPdfPages, localTesseractOptions, normalizeText, OCR_LIMITS, readBoundedFile, readSpanishModel, renderDimensions, runPdfOcr } from './pdf-ocr.engine';
import { randomUUID } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function adapters(texts: string[], recognized = 'Texto español reconocido') {
  const pages = texts.map((text) => ({
    text: jest.fn().mockResolvedValue(text),
    render: jest.fn().mockResolvedValue(Buffer.from('image')),
    close: jest.fn().mockResolvedValue(undefined),
  }));
  const pdf = { pageCount: texts.length, page: jest.fn(async (index: number) => pages[index - 1]), close: jest.fn().mockResolvedValue(undefined) };
  const ocr = { recognize: jest.fn().mockResolvedValue(recognized), close: jest.fn().mockResolvedValue(undefined) };
  return { pages, pdf, ocr, createOcr: jest.fn().mockResolvedValue(ocr) };
}

describe('PDF OCR page enrichment', () => {
  it('does not rasterize digital pages or start OCR', async () => {
    const a = adapters(['Digital text with sufficiently many readable characters.']);
    expect(await extractPdfPages(a.pdf, a.createOcr)).toMatchObject({ status: 'no-enrichment', reason: 'no-added-text', pagesProcessed: 1 });
    expect(a.createOcr).not.toHaveBeenCalled();
    expect(a.pages[0].render).not.toHaveBeenCalled();
    expect(a.pdf.close).toHaveBeenCalled();
  });

  it('selects blank and negligible pages, preserving their digital fragments', async () => {
    const a = adapters(['Digital page containing enough readable text to skip OCR.', '', '7']);
    const result = await extractPdfPages(a.pdf, a.createOcr);
    expect(result).toMatchObject({ status: 'completed', pagesProcessed: 3, pagesOcr: 2 });
    if (result.status === 'completed') expect(result.addedText).toBe('Texto español reconocido 7 Texto español reconocido');
    expect(a.pages[0].render).not.toHaveBeenCalled();
    expect(a.ocr.recognize).toHaveBeenCalledTimes(2);
    expect(a.ocr.close).toHaveBeenCalledTimes(1);
    expect(a.pages.every((p) => p.close.mock.calls.length === 1)).toBe(true);
  });

  it('caps inspection at twenty pages without accepting or truncating the separate baseline', async () => {
    const a = adapters(Array(25).fill(''));
    expect(await extractPdfPages(a.pdf, a.createOcr)).toMatchObject({ status: 'completed', pagesProcessed: 20, capped: true });
    expect(a.pdf.page).toHaveBeenCalledTimes(20);
  });

  it('bounds normalized UTF8 output without splitting a character', async () => {
    const a = adapters([''], 'á'.repeat(600000));
    const result = await extractPdfPages(a.pdf, a.createOcr);
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(Buffer.byteLength(result.addedText)).toBe(1024 * 1024);
      expect(result.addedText).not.toContain('\ufffd');
    }
    expect(normalizeText('  uno\u0000\n dos  ', 8)).toBe('uno dos');
    expect(normalizeText('aá', 2)).toBe('a');
  });

  it('returns no enrichment on failure and closes page, OCR and PDF resources', async () => {
    const a = adapters(['']);
    a.ocr.recognize.mockRejectedValue(new Error('private content'));
    expect(await extractPdfPages(a.pdf, a.createOcr)).toMatchObject({ status: 'no-enrichment', reason: 'processing-failed' });
    expect(a.pages[0].close).toHaveBeenCalled();
    expect(a.ocr.close).toHaveBeenCalled();
    expect(a.pdf.close).toHaveBeenCalled();
  });

  it('handles page text errors without publishing partial enrichment', async () => {
    const a = adapters(['', '']);
    a.pages[1].text.mockRejectedValue(new Error('bad PDF'));
    expect(await extractPdfPages(a.pdf, a.createOcr)).toMatchObject({ status: 'no-enrichment' });
    expect(a.pdf.close).toHaveBeenCalled();
  });

  it('caps raster long edge and pixel count for portrait and landscape', () => {
    for (const [width, height] of [[10000, 20000], [20000, 10000], [1, 100000]]) {
      const size = renderDimensions(width, height);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1754);
      expect(size.width * size.height).toBeLessThanOrEqual(9000000);
    }
    expect(() => renderDimensions(0, 12)).toThrow();
    expect(() => renderDimensions(Infinity, 12)).toThrow();
  });

  it('returns no added text for an unrecognized scan and closes resources', async () => {
    const a = adapters([''], '');
    expect(await extractPdfPages(a.pdf, a.createOcr)).toMatchObject({ status: 'no-enrichment', reason: 'no-added-text', pagesOcr: 1 });
    expect(a.ocr.close).toHaveBeenCalled();
  });

  it('closes page/PDF when OCR initialization fails', async () => {
    const a = adapters(['']);
    a.createOcr.mockRejectedValue(new Error('startup failed'));
    expect(await extractPdfPages(a.pdf, a.createOcr)).toMatchObject({ status: 'no-enrichment', reason: 'processing-failed' });
    expect(a.pages[0].close).toHaveBeenCalled();
    expect(a.pdf.close).toHaveBeenCalled();
  });

  it('uses only explicitly resolved package assets and disables disk model cache', () => {
    const options = localTesseractOptions(resolve('ocr-models'));
    expect(options.langPath).toBe(resolve('ocr-models'));
    expect(options.workerPath).toBe(require.resolve('tesseract.js/src/worker-script/node/index.js'));
    expect(options.corePath).toBe(require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js'));
    expect(options.cacheMethod).toBe('none');
    expect(() => localTesseractOptions('https://remote')).toThrow();
  });

  it('rejects oversized input and missing/corrupt local models without downloading', async () => {
    const directory = resolve('.tmp/basic-search-ocr/engine-tests', randomUUID());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const input = resolve(directory, 'input.pdf');
    await writeFile(input, '%PDF-1.7 synthetic');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
    try {
      expect(await runPdfOcr(input, directory)).toMatchObject({ reason: 'model-unavailable' });
      await writeFile(resolve(directory, 'spa.traineddata.gz'), 'corrupt');
      await expect(readSpanishModel(directory)).rejects.toThrow();
      expect(await runPdfOcr(input, directory)).toMatchObject({ reason: 'model-unavailable' });
      const file = await open(input, 'r+');
      try { await file.truncate(OCR_LIMITS.inputBytes + 1); } finally { await file.close(); }
      await expect(readBoundedFile(input, OCR_LIMITS.inputBytes)).rejects.toThrow();
      expect(await runPdfOcr(input, directory)).toMatchObject({ reason: 'invalid-input' });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it('rejects missing local input/model without loading OCR or exposing paths', async () => {
    expect(await runPdfOcr('/missing/private.pdf', '/missing/models')).toMatchObject({ status: 'no-enrichment' });
  });
});
