const FIT_SCRIPT = [
  "function fitLines() {",
  "  for (const el of document.querySelectorAll('.editable-layer .txt[data-target-width]')) {",
  "    el.style.transform = '';",
  "    const actual = el.getBoundingClientRect().width;",
  '    const expected = parseFloat(el.dataset.targetWidth) * 96 / 72;',
  "    if (actual > 0 && expected > 0) el.style.transform = 'scaleX(' + (expected / actual) + ')';",
  '  }',
  '}',
  "window.addEventListener('load', fitLines);",
  'document.fonts?.ready.then(fitLines);',
].join('\n');

const RICH_TEXT_CSS = `
.richtext { white-space: normal !important; line-height: 1.35 !important; text-align: justify; overflow: visible; }
.richtext p { margin: 0 0 8pt; line-height: 1.35; text-align: justify; }
.richtext p:last-child { margin-bottom: 0; }
.prebody { margin: 0 0 10pt; }
.prebody-row { margin: 0 0 3pt; line-height: 1.35; }
.prebody-row strong { font-weight: 700; }
.prebody ul { margin: 2pt 0 0 18pt; padding: 0; }
.richtext ul, .richtext ol { margin: 0 0 8pt 18pt; padding: 0; }
.richtext li { margin: 0 0 3pt; }
.richtext h1 { font-size: 15pt; margin: 0 0 8pt; }
.richtext h2 { font-size: 13pt; margin: 0 0 8pt; }
.richtext h3 { font-size: 11.5pt; margin: 0 0 8pt; }
.richtext table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
.richtext th, .richtext td { border: 1px solid #000; padding: 3pt 4pt; vertical-align: top; }
`;

const FLOW_CSS = `
@page { size: letter; margin: 90pt 0; }
html, body { margin: 0; padding: 0; background: white; }
.flow-title { position: absolute; z-index: 1; }
.flow-body {
  position: relative;
  z-index: 1;
  margin: 97pt 49.0876pt 0 57.4pt;
  padding-left: 63.56pt;
  border-left: 1.5pt solid #92d050;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11.04pt;
  line-height: 1.35;
  text-align: justify;
  color: #000;
}
.flow-body p { margin: 0 0 8pt; line-height: 1.35; text-align: justify; orphans: 2; widows: 2; }
.flow-body p:last-child { margin-bottom: 0; }
.flow-body ul, .flow-body ol { margin: 0 0 8pt 18pt; padding: 0; }
.flow-body li { margin: 0 0 3pt; }
.flow-body h1 { font-size: 15pt; margin: 0 0 8pt; break-after: avoid; }
.flow-body h2 { font-size: 13pt; margin: 0 0 8pt; break-after: avoid; }
.flow-body h3 { font-size: 11.5pt; margin: 0 0 8pt; break-after: avoid; }
.flow-body table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
.flow-body th, .flow-body td { border: 1px solid #000; padding: 3pt 4pt; vertical-align: top; }
.flow-signatures { margin-top: 28pt; break-inside: avoid; page-break-inside: avoid; }
.flow-sig-row { display: flex; gap: 24pt; }
.flow-sig-col { flex: 1; }
.flow-sig-title { font-weight: 700; font-size: 11.04pt; }
.flow-sig-line { border-top: 1px solid #000; width: 78%; margin: 52pt 0 6pt; }
.flow-sig-name { min-height: 14pt; }
.flow-sig-role { min-height: 14pt; }
.flow-sig-full { margin-top: 26pt; }
`;

const SIGNATURE_BOXES = {
  recibidoLabel: 'acta-19',
  entregadoLabel: 'acta-20',
  recibidoNombre: 'acta-23',
  recibidoCargo: 'acta-25',
  entregadoNombre: 'acta-24',
  entregadoCargo: 'acta-26',
  vistoLabel: 'acta-27',
  vistoNombre: 'acta-29',
  vistoCargo: 'acta-30',
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function boxContent(frame: any, id: string, fallback = ''): string {
  return String(
    (frame?.body?.boxes ?? []).find((box: any) => box.id === id)?.content ?? fallback,
  );
}

function boxStyle(box: any, position: 'absolute' | 'fixed' = 'absolute'): string {
  return [
    `position:${position}`,
    `left:${box.x}pt`,
    `top:${box.y}pt`,
    `font-size:${box.fontSize}pt`,
    `font-family:${box.fontFamily ?? 'Arial, sans-serif'}`,
    `font-weight:${box.fontWeight ?? '400'}`,
    `font-style:${box.fontStyle ?? 'normal'}`,
    `color:${box.color ?? '#000000'}`,
    `text-align:${box.center ? 'center' : box.align ?? 'left'}`,
    ...(box.center ? ['left:50%', 'transform:translateX(-50%)'] : []),
  ].join(';');
}

function textBox(box: any, position: 'absolute' | 'fixed' = 'absolute'): string {
  const target = Number(box.width) > 0 ? ` data-target-width="${box.width}"` : '';
  const className = position === 'fixed' ? 'txt flow-fixed' : 'txt';
  const content =
    box.type === 'pageNumber' || box.raw
      ? box.content
      : escapeHtml(box.content);
  return `<span class="${className}" style="${boxStyle(box, position)};"${target}>${content}</span>`;
}

function imageVisualStyle(box: any): string {
  const opacity = Number.isFinite(Number(box.opacity))
    ? Math.min(1, Math.max(0, Number(box.opacity)))
    : 1;
  const rotation = Number.isFinite(Number(box.rotation))
    ? Math.min(180, Math.max(-180, Number(box.rotation)))
    : 0;
  return `${rotation ? `transform:rotate(${rotation}deg);` : ''}opacity:${opacity};`;
}

function imageBox(box: any, position: 'absolute' | 'fixed' = 'absolute'): string {
  const fit = box.fit === 'cover' ? 'cover' : 'contain';
  const objectPosition = box.objectPosition ?? 'center';
  return `<img class="flow-fixed" src="${box.content}" style="position:${position};left:${box.x}pt;top:${box.y}pt;width:${box.width}pt;height:${box.height ?? 50}pt;object-fit:${fit};object-position:${objectPosition};${imageVisualStyle(box)}" />`;
}

function richTextBox(box: any): string {
  return `<div class="txt richtext" data-box-id="${escapeHtml(String(box.id ?? 'body'))}" style="${boxStyle(box)};width:${box.width}pt;height:${box.height ?? 240}pt;white-space:normal;">${box.content}</div>`;
}

function boxToHtml(box: any): string {
  if (box.type === 'richText') return richTextBox(box);
  if (box.type === 'image') return imageBox(box);
  return textBox(box);
}

export function fullPageFrameHtml(frame: any): string {
  const boxes = (frame?.body?.boxes ?? []).map(boxToHtml).join('');
  return `<style>${frame?.styles ?? ''}${RICH_TEXT_CSS}</style><main class="sheet">${frame?.body?.backgroundSvg ?? ''}<div class="editable-layer">${boxes}</div></main><script>${FIT_SCRIPT}</script>`;
}

function signatureBlock(frame: any): string {
  if (typeof frame?.signatureFlowHtml === 'string' && frame.signatureFlowHtml.trim()) {
    return frame.signatureFlowHtml;
  }
  const label = (id: string, fallback: string) =>
    escapeHtml(boxContent(frame, id, fallback).trim());
  const content = (id: string) => boxContent(frame, id);
  return `<div class="flow-signatures">
    <div class="flow-sig-row">
      <div class="flow-sig-col">
        <div class="flow-sig-title">${label(SIGNATURE_BOXES.recibidoLabel, 'RECIBÍ CONFORME')}</div>
        <div class="flow-sig-line"></div>
        <div class="flow-sig-name">${content(SIGNATURE_BOXES.recibidoNombre)}</div>
        <div class="flow-sig-role">${content(SIGNATURE_BOXES.recibidoCargo)}</div>
      </div>
      <div class="flow-sig-col">
        <div class="flow-sig-title">${label(SIGNATURE_BOXES.entregadoLabel, 'ENTREGUÉ CONFORME')}</div>
        <div class="flow-sig-line"></div>
        <div class="flow-sig-name">${content(SIGNATURE_BOXES.entregadoNombre)}</div>
        <div class="flow-sig-role">${content(SIGNATURE_BOXES.entregadoCargo)}</div>
      </div>
    </div>
    <div class="flow-sig-full">
      <div class="flow-sig-title">${label(SIGNATURE_BOXES.vistoLabel, 'VISTO BUENO')}</div>
      <div class="flow-sig-line"></div>
      <div class="flow-sig-name">${content(SIGNATURE_BOXES.vistoNombre)}</div>
      <div class="flow-sig-role">${content(SIGNATURE_BOXES.vistoCargo)}</div>
    </div>
  </div>`;
}

function backgroundCrop(background: string, y: number, height: number): string {
  const match = /<svg[^>]*>([\s\S]*)<\/svg>\s*$/.exec(background);
  const inner = match?.[1] ?? background;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${y} 612 ${height}" width="612" height="${height}" preserveAspectRatio="none">${inner}</svg>`;
}

function flowBoxAt(box: any, top: number, position: 'absolute' | 'fixed' = 'absolute'): string {
  if (box.type === 'image') {
    const fit = box.fit === 'cover' ? 'cover' : 'contain';
    const objectPosition = box.objectPosition ?? 'center';
    const opacity = Number.isFinite(Number(box.opacity))
      ? Math.min(1, Math.max(0, Number(box.opacity)))
      : 1;
    const rotation = Number.isFinite(Number(box.rotation))
      ? Math.min(180, Math.max(-180, Number(box.rotation)))
      : 0;
    const transform = [
      box.center ? 'translateX(-50%)' : '',
      rotation ? `rotate(${rotation}deg)` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const imageLeft = box.center ? 'left:50%' : `left:${box.x}pt`;
    return `<img src="${box.content}" style="position:${position};${imageLeft};top:${top}pt;width:${box.width}pt;height:${box.height ?? 50}pt;object-fit:${fit};object-position:${objectPosition};${transform ? `transform:${transform};` : ''}opacity:${opacity};" />`;
  }
  const target = Number(box.width) > 0 && !box.center ? ` data-target-width="${box.width}"` : '';
  const content =
    box.type === 'pageNumber' || box.raw
      ? box.content
      : escapeHtml(box.content);
  const align = box.center ? 'center' : box.align ?? 'left';
  const positionStyle = box.center
    ? `left:50%;transform:translateX(-50%)`
    : `left:${box.x}pt`;
  return `<span class="txt" style="position:${position};${positionStyle};top:${top}pt;font-size:${box.fontSize}pt;font-family:${box.fontFamily ?? 'Arial, sans-serif'};font-weight:${box.fontWeight ?? '400'};font-style:${box.fontStyle ?? 'normal'};color:${box.color ?? '#000000'};text-align:${align};"${target}>${content}</span>`;
}

export function fullPageFlowFrame(frame: any): {
  html: string;
  headerTemplate: string;
  footerTemplate: string;
} {
  const boxes = frame?.body?.boxes ?? [];
  const background = frame?.body?.backgroundSvg ?? '';
  const headerBackground = backgroundCrop(background, 0, 90);
  const footerBackground = backgroundCrop(background, 702, 90).replace(/<image[\s\S]*?\/>/g, '');
  const headerBoxes = boxes
    .filter((box: any) => box.role === 'frame' && box.y < 90)
    .map((box: any) => flowBoxAt(box, box.y))
    .join('');
  const footerBoxes = boxes
    .filter((box: any) => box.role === 'frame' && box.y >= 700)
    .map((box: any) => flowBoxAt(box, box.y - 702))
    .join('');
  const body = boxes.find((box: any) => box.type === 'richText');
  const titleBoxes = boxes
    .filter(
      (box: any) =>
        box.type !== 'richText' &&
        box.role !== 'frame' &&
        body &&
        box.y < body.y,
    )
    .map((box: any) => flowBoxAt(box, box.y - 90))
    .join('');
  const headerTemplate = `<div style="position:relative;width:612pt;height:90pt;overflow:hidden;font-family:Arial,sans-serif;">
    <div style="position:absolute;left:0;top:0;width:612pt;height:90pt;">${headerBackground}</div>
    ${headerBoxes}
  </div>`;
  const footerTemplate = `<div style="position:relative;width:612pt;height:90pt;overflow:hidden;font-family:Arial,sans-serif;">
    <div style="position:absolute;left:0;top:0;width:612pt;height:90pt;">${footerBackground}</div>
    ${footerBoxes}
    <div style="position:absolute;right:40pt;bottom:4pt;font-size:7pt;color:#374151;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
  </div>`;
  if (!body) {
    return { html: fullPageFrameHtml(frame), headerTemplate, footerTemplate };
  }
  return {
    html: `<style>${frame?.styles ?? ''}${RICH_TEXT_CSS}${FLOW_CSS}</style>
      ${titleBoxes}
      <div class="flow-body">${body.content}${signatureBlock(frame)}</div>`,
    headerTemplate,
    footerTemplate,
  };
}
