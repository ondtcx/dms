import ExcelJS from 'exceljs';
import { presentWorkbook, sanitizeSpreadsheetHtml } from './xlsx-presentation';

describe('Structured XLSX presentation', () => {
  it('preserves bounded styles, merges and dimensions without workbook CSS', () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Styled');
    sheet.mergeCells('A1:B2');
    sheet.getColumn(1).width = 24;
    sheet.getRow(1).height = 32;
    const cell = sheet.getCell('A1');
    cell.value = '<Styled>';
    cell.font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFF0000' },
      name: 'Arial',
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' },
    };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0000FF' } } };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    sheet.getCell('C1').value = 0.125;
    sheet.getCell('C1').numFmt = '0.00%';
    sheet.getRow(3).hidden = true;
    sheet.getCell('A3').value = 'Hidden row';
    const result = presentWorkbook(book);
    expect(result.html).toContain('colspan="2" rowspan="2"');
    expect(result.html).toContain('&lt;Styled&gt;');
    expect(result.html).toContain('12.50%');
    expect(result.html).not.toContain('Hidden row');
    expect(result.styles).toContain('background-color:#FFFF00');
    expect(result.styles).toContain('border-bottom:1px solid #0000FF');
    expect(result.styles).toContain('text-align:center');
    expect(result.styles).toContain('width:173px');
    expect(result.styles).toContain('height:32pt');
    expect(sanitizeSpreadsheetHtml(result.html)).toContain('class="xp');
  });

  it('formats cached/shared results, dates and a declared unsupported-format fallback', () => {
    const book = new ExcelJS.Workbook();
    book.properties.date1904 = true;
    const sheet = book.addWorksheet('Numbers');
    sheet.getCell('A1').value = { formula: '1/4', result: 0.25 };
    sheet.getCell('A1').numFmt = '0%';
    sheet.getCell('B1').value = { sharedFormula: 'A1', result: 1234.5 };
    sheet.getCell('B1').numFmt = '$#,##0.00';
    sheet.getCell('C1').value = new Date('1904-01-02T00:00:00Z');
    sheet.getCell('C1').numFmt = 'yyyy-mm-dd';
    sheet.getCell('D1').value = 12;
    sheet.getCell('D1').numFmt = '[Red][<0]0;[Blue]0';
    const result = presentWorkbook(book);
    expect(result.html).toContain('25%');
    expect(result.html).toContain('$1,234.50');
    expect(result.html).toContain('1904-01-02');
    expect(result.html).toContain('12 (formato no compatible)');
    expect(result.html).not.toContain('1/4');
  });

  it('rejects hostile style primitives and strips arbitrary markup and CSS', () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Hostile');
    sheet.getCell('A1').value = '<img src="https://bad">';
    sheet.getCell('A1').font = {
      name: 'Arial; background:url(https://bad)',
      color: { argb: 'red;}body{display:none' },
      size: Infinity,
    };
    const result = presentWorkbook(book);
    expect(result.styles).not.toMatch(/url|https|Infinity|display:none/);
    expect(result.html).toContain('&lt;img');
    expect(
      sanitizeSpreadsheetHtml(
        '<style>bad</style><td class="xp1 bad" style="color:red" onclick="bad()">safe</td><script>bad()</script><a href="https://bad">link</a>',
      ),
    ).not.toMatch(/style|onclick|script|https| bad/);
  });

  it('retains visible portions of merges and refuses excessive dimensions', () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Merged');
    sheet.mergeCells('A1:C2');
    sheet.getCell('A1').value = 'Merged text';
    sheet.getColumn(1).hidden = true;
    sheet.getRow(1).hidden = true;
    const result = presentWorkbook(book);
    expect(result.html).toContain('Merged text');
    expect(result.html).toContain('colspan="2" rowspan="1"');
    sheet.getCell('A2001').value = 'too large';
    expect(() => presentWorkbook(book)).toThrow('límite');
  });
});
