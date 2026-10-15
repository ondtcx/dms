import { Worker } from 'node:worker_threads';
import ExcelJS from 'exceljs';
import { OFFICE_WORKER_SOURCE } from './office-content.worker';

export function parseWorkbook(
  bytes: Buffer,
): Promise<{ html?: string; styles?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(OFFICE_WORKER_SOURCE, {
      eval: true,
      workerData: { bytes, kind: 'xlsx' },
    });
    worker.once('message', (result) => {
      void worker.terminate().then(() => resolve(result));
    });
    worker.once('error', reject);
  });
}

describe('Office content worker', () => {
  jest.setTimeout(30000);
  it('embeds the trusted presentation function without a source-TS runtime import', () => {
    expect(OFFICE_WORKER_SOURCE).toContain('function presentWorkbook');
    expect(OFFICE_WORKER_SOURCE).not.toMatch(/require\([^)]*\.ts['"]\)/);
  });
  it('renders visible sheets, escaped values, rich text and cached formulas without calculation', async () => {
    const workbook = new ExcelJS.Workbook();
    const visible = workbook.addWorksheet('<Visible>');
    visible.getCell('A1').value = '<script>alert(1)</script>';
    visible.getCell('B1').value = { formula: '1+2', result: 42 };
    visible.getCell('C1').value = {
      text: 'Plain link',
      hyperlink: 'https://invalid.example',
    };
    visible.getCell('D1').value = {
      richText: [{ text: 'Rich ' }, { text: 'text' }],
    };
    visible.getCell('E1').value = { formula: '1+2' };
    workbook.addWorksheet('Secret', { state: 'hidden' }).getCell('A1').value =
      'hidden content';
    const result = await parseWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    expect(result.error).toBeUndefined();
    expect(result.html).toContain('&lt;Visible&gt;');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).toContain('<td>42</td>');
    expect(result.html).toContain('Plain link');
    expect(result.html).toContain('Rich text');
    expect(result.html).toContain('Sin resultado almacenado');
    expect(result.html).not.toContain('https://');
    expect(result.html).not.toContain('hidden content');
    expect(result.html).not.toContain('1+2');
  });

  it('rejects dimensions instead of truncating a full preview', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Large').getCell('A2001').value = 'last cell';
    const result = await parseWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    expect(result.error).toContain('límite');
    expect(result.html).toBeUndefined();
  });

  it('retains styles and 1904 dates through actual ExcelJS serialization in the worker', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.properties.date1904 = true;
    const sheet = workbook.addWorksheet('Styled');
    sheet.mergeCells('A1:B1');
    sheet.getCell('A1').value = 'Merged';
    sheet.getCell('A1').font = { bold: true, color: { argb: 'FFCC0000' } };
    sheet.getCell('A2').value = new Date('1904-01-02T00:00:00Z');
    sheet.getCell('A2').numFmt = 'yyyy-mm-dd';
    const result = await parseWorkbook(
      Buffer.from(await workbook.xlsx.writeBuffer()),
    );
    expect(result.error).toBeUndefined();
    expect(result.html).toContain('1904-01-02');
    expect(result.html).toContain('colspan="2"');
    expect(result.styles).toContain('font-weight:700');
    expect(result.styles).toContain('color:#CC0000');
  });
});
