import { presentWorkbook } from './xlsx-presentation';

// El análisis se ejecuta en un hilo terminable; nunca se calculan fórmulas.
export const OFFICE_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async () => {
  const buffer = Buffer.from(workerData.bytes);
  let html;
  let styles;
  if (workerData.kind === 'docx') {
    const mammoth = require('mammoth');
    const result = await mammoth.convertToHtml({buffer}, {
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(async image => {
        if (!['image/png','image/jpeg','image/gif','image/webp'].includes(image.contentType)) throw new Error('Imagen no compatible; descarga el original');
        const bytes = await image.read();
        if (bytes.length > 1048576) throw new Error('Imagen demasiado grande');
        const metadata = await require('sharp')(bytes, {limitInputPixels: 10000000}).metadata();
        if (!['png','jpeg','gif','webp'].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width * metadata.height > 10000000 || (metadata.pages || 1) > 1) throw new Error('Imagen fuera de los límites');
        return {src:'data:'+image.contentType+';base64,'+bytes.toString('base64')};
      })
    });
    html = result.value;
  } else {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const presentation = (${presentWorkbook.toString()})(workbook);
    html = presentation.html;
    styles = presentation.styles;
  }
  if (Buffer.byteLength(html) > 8388608) throw new Error('El contenido supera el límite de vista previa');
  parentPort.postMessage({html,styles});
})().catch(error => parentPort.postMessage({error:error.message}));
`;
