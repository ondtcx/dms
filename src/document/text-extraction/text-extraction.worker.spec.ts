import { extractionWorkerSource, normalizeText } from './text-extraction.worker';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { TextExtractionService } from './text-extraction.service';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function extractInWorker(bytes: Buffer, mime: string) {
  const dir = await mkdtemp(join(tmpdir(), 'dms-parser-'));
  const path = join(dir, 'fixture');
  try {
    await writeFile(path, bytes);
    return await new TextExtractionService().extractFromFile(path, mime);
  } finally { await unlink(path); await rmdir(dir); }
}
describe('text extraction parsers', () => {
  it('contains synchronous IPC send and disconnect failures', async () => {
    for (const sendThrows of [true, false]) {
      const child = new EventEmitter() as any;
      child.connected = true;
      child.disconnect = jest.fn(() => { throw new Error('disconnect'); });
      child.send = jest.fn((_value, callback) => {
        if (sendThrows) throw new Error('send');
        callback(null);
      });
      runInNewContext(extractionWorkerSource(), { process: child });
      child.emit('message', { filePath: 'unused', mimetype: 'text/plain' });
      await new Promise(resolve => setImmediate(resolve));
      expect(child.exitCode).toBe(1);
      expect(child.disconnect).toHaveBeenCalledTimes(1);
      child.connected = false;
      child.emit('error', new Error('late'));
      expect(child.disconnect).toHaveBeenCalledTimes(1);
    }
  });
  it('normalizes and truncates without splitting UTF8', () => {
    expect(normalizeText(' a\0\t b\n ')).toBe('a b');
    expect(normalizeText(' \0 ')).toBeNull();
    const text = normalizeText('a'.repeat(1048575) + '😀');
    expect(Buffer.byteLength(text!)).toBe(1048575);
    expect(text).not.toContain('�');
  });
  it.each([
    ['unsupported image', () => Buffer.from('hello'), 'image/png', null],
    ['malformed DOCX', () => Buffer.from('bad'), DOCX, null],
    ['malformed XLSX', () => Buffer.from('bad'), XLSX, null],
    ['header-valid malformed PDF', () => Buffer.from('%PDF-1.7\nmalformed parser input'), 'application/pdf', null],
    ['oversized text', () => Buffer.alloc(10485761), 'text/plain', null],
    ['invalid UTF8', () => Buffer.from([255]), 'text/plain', null],
    ['HTML without script text', () => Buffer.from('<p>Hello</p><script>bad</script>'), 'text/html', 'Hello'],
  ] as const)('handles %s input', async (_name, bytes, mime, expected) => {
    await expect(extractInWorker(bytes(), mime)).resolves.toBe(expected);
  });

  let textPdfBytes: Buffer;
  let imagePdfBytes: Buffer;
  let docxBytes: Buffer;
  let encryptedDocxBytes: Buffer;
  let externalDocxBytes: Buffer;
  let xlsxBytes: Buffer;
  beforeAll(async () => {
    const { PDFDocument, StandardFonts } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Synthetic PDF text', { font: await pdf.embedFont(StandardFonts.Helvetica) });
    textPdfBytes = Buffer.from(await pdf.save());
    const imagePdf = await PDFDocument.create();
    const image = await imagePdf.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
    imagePdf.addPage().drawImage(image);
    imagePdfBytes = Buffer.from(await imagePdf.save());
    const zip = new (require('jszip'))();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX text</w:t></w:r></w:p></w:body></w:document>');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    docxBytes = bytes;
    const encrypted = Buffer.from(bytes);
    for (let i = 0; i < encrypted.length - 46; i++) {
      if (encrypted.readUInt32LE(i) === 0x02014b50) { encrypted.writeUInt16LE(1, i + 8); break; }
    }
    encryptedDocxBytes = encrypted;
    zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://example.com/image" Target="https://example.com" TargetMode="External"/></Relationships>');
    externalDocxBytes = await zip.generateAsync({ type: 'nodebuffer' });
    const book = new (require('exceljs').Workbook)();
    const sheet = book.addWorksheet('Visible');
    sheet.getCell('A1').value = { richText: [{ text: 'Rich' }, { text: ' text' }] };
    sheet.getCell('B1').value = { formula: '1+2', result: 3 };
    sheet.getCell('C1').value = new Date('2024-01-02T00:00:00Z');
    sheet.getCell('D1').value = { formula: '1+9' };
    sheet.getCell('A2').value = 'hidden row'; sheet.getRow(2).hidden = true;
    sheet.getCell('E1').value = 'hidden column'; sheet.getColumn(5).hidden = true;
    book.addWorksheet('Hidden', { state: 'hidden' }).getCell('A1').value = 'hidden sheet';
    xlsxBytes = Buffer.from(await book.xlsx.writeBuffer());
  }, 30_000);

  it.each([
    ['text PDF', () => textPdfBytes, 'Synthetic PDF text'],
    ['image-only PDF', () => imagePdfBytes, null],
  ] as const)('extracts %s without OCR', async (_name, bytes, expected) => {
    const result = await extractInWorker(Buffer.from(bytes()), 'application/pdf');
    if (expected === null) expect(result).toBeNull();
    else expect(result).toContain(expected);
  }, 15_000);
  it.each([
    ['synthetic DOCX', () => docxBytes, DOCX, 'DOCX text'],
    ['DOCX with XLSX MIME', () => docxBytes, XLSX, null],
    ['encrypted DOCX', () => encryptedDocxBytes, DOCX, null],
    ['external DOCX relationships', () => externalDocxBytes, DOCX, null],
    ['visible XLSX values, rich text, dates and cached formulas only', () => xlsxBytes, XLSX, 'Rich text 3 2024-01-02T00:00:00.000Z'],
    ['XLSX with DOCX MIME', () => xlsxBytes, DOCX, null],
  ] as const)('handles %s', async (_name, bytes, mime, expected) => {
    await expect(extractInWorker(Buffer.from(bytes()), mime)).resolves.toBe(expected);
  }, 15_000);
  it.each(['text', 'oversized', 'missing'] as const)('runs the production isolated child against an owned %s file', async (kind) => {
    const dir = await mkdtemp(join(tmpdir(), 'dms-extraction-'));
    const path = join(dir, 'text.txt');
    try {
      await writeFile(path, kind === 'oversized' ? Buffer.alloc(10485761) : 'Actual worker text');
      const inputPath = kind === 'missing' ? join(dir, 'missing') : path;
      const expected = kind === 'text' ? 'Actual worker text' : null;
      expect(await new TextExtractionService().extractFromFile(inputPath, 'text/plain')).toBe(expected);
    } finally { await unlink(path); await rmdir(dir); }
  }, 15_000);
});
