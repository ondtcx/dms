const FIT_SCRIPT = [
  "function fitLines() {",
  "  for (const el of document.querySelectorAll('.editable-layer .txt')) {",
  "    el.style.transform = '';",
  "    const actual = el.getBoundingClientRect().width;",
  '    const expected = parseFloat(el.dataset.targetWidth) * 96 / 72;',
  "    if (actual > 0 && expected > 0) el.style.transform = 'scaleX(' + (expected / actual) + ')';",
  '  }',
  '}',
  "window.addEventListener('load', fitLines);",
  'document.fonts?.ready.then(fitLines);',
].join('\n');

function boxToHtml(box: any): string {
  const target =
    Number(box.width) > 0 ? ` data-target-width="${box.width}"` : '';
  return `<span class="txt" style="left:${box.x}pt;top:${box.y}pt;font-size:${box.fontSize}pt;font-family:${box.fontFamily ?? 'Arial, sans-serif'};font-weight:${box.fontWeight ?? '400'};font-style:${box.fontStyle ?? 'normal'};color:${box.color ?? '#000000'};"${target}>${box.content}</span>`;
}

export function fullPageFrameHtml(frame: any): string {
  const boxes = (frame?.body?.boxes ?? []).map(boxToHtml).join('');
  return `<style>${frame?.styles ?? ''}</style><main class="sheet">${frame?.body?.backgroundSvg ?? ''}<div class="editable-layer">${boxes}</div></main><script>${FIT_SCRIPT}</script>`;
}
