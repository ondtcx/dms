import type ExcelJS from 'exceljs';
import sanitizeHtml from 'sanitize-html';

export interface SpreadsheetPresentation {
  html: string;
  styles: string;
}

// La función es autocontenida para ejecutarse también en el hilo terminable compilado.
export function presentWorkbook(
  workbook: ExcelJS.Workbook,
): SpreadsheetPresentation {
  const escape = (value: unknown) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const bounded = (
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  const color = (value: any) =>
    typeof value?.argb === 'string' && /^[0-9a-f]{8}$/i.test(value.argb)
      ? '#' + value.argb.slice(2).toUpperCase()
      : undefined;
  const classes = new Map<string, string>();
  const classFor = (style: string) => {
    if (!style) return '';
    let name = classes.get(style);
    if (!name) {
      if (classes.size >= 10000) throw new Error('Demasiados estilos de celda');
      name = 'xp' + classes.size;
      classes.set(style, name);
    }
    return ` class="${name}"`;
  };
  const fontStyle = (font: any) => {
    const css: string[] = [];
    if (!font) return '';
    if (font.bold === true) css.push('font-weight:700');
    if (font.italic === true) css.push('font-style:italic');
    if (font.underline === true || font.underline === 'single')
      css.push('text-decoration:underline');
    if (font.strike === true) css.push('text-decoration:line-through');
    if (typeof font.size === 'number' && Number.isFinite(font.size))
      css.push(`font-size:${bounded(font.size, 6, 72, 11)}pt`);
    const rgb = color(font.color);
    if (rgb) css.push(`color:${rgb}`);
    if (
      [
        'Arial',
        'Calibri',
        'Times New Roman',
        'Courier New',
        'Verdana',
        'Helvetica',
      ].includes(font.name)
    )
      css.push(`font-family:"${font.name}"`);
    return css.join(';');
  };
  const cellStyle = (cell: ExcelJS.Cell) => {
    const css = [fontStyle(cell.font)];
    if (cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid') {
      const rgb = color(cell.fill.fgColor);
      if (rgb) css.push(`background-color:${rgb}`);
    }
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const border = cell.border?.[side];
      const supported: Record<string, string> = {
        thin: '1px solid',
        medium: '2px solid',
        thick: '3px solid',
        double: '3px double',
        dotted: '1px dotted',
        dashed: '1px dashed',
        hair: '1px solid',
        mediumDashed: '2px dashed',
        dashDot: '1px dashed',
        dashDotDot: '1px dashed',
      };
      if (
        border &&
        Object.prototype.hasOwnProperty.call(supported, border.style)
      )
        css.push(
          `border-${side}:${supported[border.style]} ${color(border.color) || '#000000'}`,
        );
    }
    const alignment = cell.alignment;
    if (alignment) {
      if (['left', 'center', 'right', 'justify'].includes(alignment.horizontal))
        css.push(`text-align:${alignment.horizontal}`);
      if (['top', 'middle', 'bottom'].includes(alignment.vertical))
        css.push(`vertical-align:${alignment.vertical}`);
      if (alignment.wrapText === true) css.push('white-space:pre-wrap');
      if (typeof alignment.indent === 'number')
        css.push(`padding-left:${bounded(alignment.indent, 0, 10, 0) * 8}px`);
    }
    return css.filter(Boolean).join(';');
  };
  const numberText = (value: number, format: string) => {
    if (!Number.isFinite(value)) return 'Valor numérico no válido';
    if (!format || format === 'General') return String(value);
    // Subconjunto explícito; no se interpretan reglas, colores ni expresiones del libro.
    const match = /^(\$|€|£)?(#,##)?0(?:\.(0{1,6}))?(%)?$/.exec(format);
    if (!match) return `${value} (formato no compatible)`;
    const precision = match[3]?.length || 0;
    const text = (value * (match[4] ? 100 : 1)).toLocaleString('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: !!match[2],
    });
    return (match[1] || '') + text + (match[4] || '');
  };
  const valueHtml = (value: any, format: string): string => {
    if (value == null) return '';
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) return 'Fecha no válida';
      const iso = value.toISOString();
      if (['yyyy-mm-dd', 'mm-dd-yy', 'm/d/yy', 'dd/mm/yyyy'].includes(format)) {
        if (format === 'dd/mm/yyyy')
          return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
        if (format === 'm/d/yy' || format === 'mm-dd-yy')
          return `${value.getUTCMonth() + 1}/${value.getUTCDate()}/${iso.slice(2, 4)}`;
        return iso.slice(0, 10);
      }
      return escape(iso);
    }
    if (typeof value === 'number') return escape(numberText(value, format));
    if (typeof value !== 'object') return escape(value);
    if ('formula' in value || 'sharedFormula' in value)
      return value.result === undefined
        ? 'Sin resultado almacenado'
        : valueHtml(value.result, format);
    if (Array.isArray(value.richText))
      return value.richText
        .map((part) => {
          const style = fontStyle(part.font);
          return style
            ? `<span${classFor(style)}>${escape(part.text)}</span>`
            : escape(part.text);
        })
        .join('');
    return escape(value.text ?? value.error ?? '');
  };
  let cells = 0;
  const parts: string[] = [];
  if (workbook.worksheets.length > 30) throw new Error('Demasiadas hojas');
  for (const sheet of workbook.worksheets) {
    if (sheet.state !== 'visible') continue;
    if (
      sheet.rowCount > 2000 ||
      sheet.columnCount > 100 ||
      cells + sheet.rowCount * sheet.columnCount > 50000
    )
      throw new Error('La hoja supera el límite de celdas');
    cells += sheet.rowCount * sheet.columnCount;
    const rows = Array.from({ length: sheet.rowCount }, (_, i) => i + 1).filter(
      (i) => !sheet.getRow(i).hidden,
    );
    const columns = Array.from(
      { length: sheet.columnCount },
      (_, i) => i + 1,
    ).filter((i) => !sheet.getColumn(i).hidden);
    const merged = new Map<
      string,
      {
        row: number;
        col: number;
        rowspan: number;
        colspan: number;
        master: ExcelJS.Cell;
      }
    >();
    for (const range of sheet.model.merges || []) {
      const match = /^([A-Z]{1,3})([1-9]\d*):([A-Z]{1,3})([1-9]\d*)$/.exec(
        range,
      );
      if (!match) throw new Error('Combinación de celdas no compatible');
      const colNumber = (letters: string) =>
        [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      const top = Number(match[2]),
        bottom = Number(match[4]),
        left = colNumber(match[1]),
        right = colNumber(match[3]);
      if (top > bottom || left > right || bottom > 2000 || right > 100)
        throw new Error('La combinación supera el límite');
      const visibleRows = rows.filter((i) => i >= top && i <= bottom);
      const visibleCols = columns.filter((i) => i >= left && i <= right);
      if (!visibleRows.length || !visibleCols.length) continue;
      const info = {
        row: visibleRows[0],
        col: visibleCols[0],
        rowspan: visibleRows.length,
        colspan: visibleCols.length,
        master: sheet.getCell(top, left),
      };
      for (const row of visibleRows)
        for (const col of visibleCols) {
          const key = `${row}:${col}`;
          if (merged.has(key)) throw new Error('Combinaciones superpuestas');
          merged.set(key, info);
        }
    }
    parts.push(`<h1>${escape(sheet.name)}</h1><table><colgroup>`);
    for (const col of columns)
      parts.push(
        `<col${classFor(`width:${Math.round(bounded(sheet.getColumn(col).width, 1, 100, 8.43) * 7 + 5)}px`)} />`,
      );
    parts.push('</colgroup><tbody>');
    for (const row of rows) {
      parts.push(
        `<tr${classFor(`height:${bounded(sheet.getRow(row).height, 6, 300, 15)}pt`)}>`,
      );
      for (const col of columns) {
        const merge = merged.get(`${row}:${col}`);
        if (merge && (merge.row !== row || merge.col !== col)) continue;
        const cell = merge?.master || sheet.getCell(row, col);
        const span = merge
          ? ` colspan="${merge.colspan}" rowspan="${merge.rowspan}"`
          : '';
        parts.push(
          `<td${span}${classFor(cellStyle(cell))}>${valueHtml(cell.value, cell.numFmt)}</td>`,
        );
      }
      parts.push('</tr>');
    }
    parts.push('</tbody></table>');
  }
  const html = parts.join('');
  const styles =
    'table{border-collapse:collapse;table-layout:fixed}td{border:1px solid #ddd;padding:3px;overflow-wrap:anywhere;white-space:pre-wrap;font-size:11pt}h1{break-before:page}h1:first-child{break-before:auto}' +
    [...classes].map(([style, name]) => `.${name}{${style}}`).join('');
  if (Buffer.byteLength(html) + Buffer.byteLength(styles) > 8388608)
    throw new Error('El contenido supera el límite de vista previa');
  return { html, styles };
}

export function sanitizeSpreadsheetHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1',
      'table',
      'colgroup',
      'col',
      'tbody',
      'tr',
      'td',
      'span',
    ],
    allowedAttributes: { '*': ['class'], td: ['class', 'colspan', 'rowspan'] },
    allowedClasses: { '*': [/^xp\d{1,5}$/] },
    allowedSchemes: [],
    parseStyleAttributes: false,
    nestingLimit: 100,
  });
}
