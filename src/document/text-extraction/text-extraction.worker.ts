import { inspectDocxPackage, validateOfficeZip } from '../office-content/office-package-policy';

export function normalizeText(text: string): string | null {
  const normalized = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  const bytes = Buffer.from(normalized);
  let end = Math.min(bytes.length, 1048576);
  while (end < bytes.length && end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString('utf8').trim() || null;
}

// Las dependencias nativas solo se resuelven en el proceso hijo.
export async function extractBytes(bytes: Buffer, mimetype: string): Promise<string | null> {
  try {
    if (bytes.length > 10485760) return null;
    const mime = mimetype.toLowerCase().split(';')[0].trim();
    let text: string;
    if (['text/plain', 'application/json', 'application/xml', 'text/xml', 'text/markdown', 'text/html'].includes(mime)) {
      text = new (require('node:util').TextDecoder)('utf-8', { fatal: true }).decode(bytes);
      if (mime === 'text/html') text = require('sanitize-html')(text, { allowedTags: [], allowedAttributes: {}, nonTextTags: ['script', 'style', 'textarea', 'option'], textFilter: (value: string) => value + ' ' }).replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, (entity: string) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ' })[entity]);
    } else if (mime === 'application/pdf') {
      if (bytes.subarray(0, 5).toString() !== '%PDF-') return null;
      const parser = new (require('pdf-parse').PDFParse)({ data: new Uint8Array(bytes) });
      try { text = (await parser.getText({ pageJoiner: '' })).text; }
      finally { await parser.destroy(); }
    } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      validateOfficeZip(bytes);
      const zip = await require('jszip').loadAsync(bytes);
      const types = await zip.file('[Content_Types].xml')?.async('string');
      if (!types) return null;
      if (mime.endsWith('wordprocessingml.document')) {
        if (!/ContentType=["']application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml["']/.test(types)) return null;
        await inspectDocxPackage(bytes);
        text = (await require('mammoth').extractRawText({ buffer: bytes }, { externalFileAccess: false })).value;
      } else {
        if (!zip.file('xl/workbook.xml') || !zip.file('xl/_rels/workbook.xml.rels') || !Object.keys(zip.files).some((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)) || !/ContentType=["']application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml["']/.test(types)) return null;
        // Sin recursos externos, macros ni partes incrustadas.
        for (const entry of Object.values(zip.files) as any[]) {
          if (entry.dir) continue;
          if (entry.unsafeOriginalName !== entry.name || /(^|\/)\.\.?($|\/)|^\/|\\/.test(entry.name) || /vba|embedding|externalLink/i.test(entry.name)) return null;
          if (/\.(xml|rels)$/i.test(entry.name)) {
            const xml = await entry.async('string');
            if (/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']/i.test(xml)) return null;
          }
        }
        const book = new (require('exceljs').Workbook)();
        await book.xlsx.load(bytes);
        const values: string[] = [];
        const stringify = (value: any): string => {
          if (value == null) return '';
          if (value instanceof Date) return value.toISOString();
          if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
          if ('formula' in value || 'sharedFormula' in value) return stringify(value.result);
          if (value.richText) return value.richText.map((part: any) => part.text).join('');
          if (typeof value.text === 'string') return value.text;
          return '';
        };
        book.eachSheet((sheet: any) => {
          if (sheet.state !== 'visible') return;
          sheet.eachRow((row: any) => {
            if (row.hidden) return;
            row.eachCell((cell: any, column: number) => {
              if (!sheet.getColumn(column).hidden) values.push(stringify(cell.value));
            });
          });
        });
        text = values.join(' ');
      }
    } else return null;
    return normalizeText(text);
  } catch { return null; }
}

export async function runExtraction(job: { filePath: string; mimetype: string }): Promise<string | null> {
  let handle: any;
  try {
    handle = await require('node:fs/promises').open(job.filePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 10485760) return null;
    const bytes = Buffer.alloc(Math.min(stat.size + 1, 10485761));
    let size = 0;
    while (size < bytes.length) {
      const read = await handle.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > stat.size) return null;
    return await extractBytes(bytes.subarray(0, size), job.mimetype);
  } catch { return null; }
  finally { await handle?.close(); }
}

export function extractionWorkerSource(): string {
  return `
const validateOfficeZip=${validateOfficeZip.toString()};
const inspectDocxPackage=${inspectDocxPackage.toString()};
const office_package_policy_1={validateOfficeZip,inspectDocxPackage};
const normalizeText=${normalizeText.toString()};
const extractBytes=${extractBytes.toString()};
const runExtraction=${runExtraction.toString()};
process.once('message', job => {
  const finish = error => {
    if (error) process.exitCode = 1;
    try { if (process.connected) process.disconnect(); }
    catch { process.exitCode = 1; }
  };
  process.on('error', finish);
  const send = value => {
    try { process.send(value, finish); }
    catch (error) { finish(error); }
  };
  runExtraction(job).then(send, () => send(null));
});`;
}
