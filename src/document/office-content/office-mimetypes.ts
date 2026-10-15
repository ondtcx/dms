/**
 * Formatos de Office que la vista previa básica puede convertir a PDF.
 * Viven en un módulo sin dependencias pesadas para que el conteo de páginas y
 * los scripts de backfill puedan decidir compatibilidad sin cargar Puppeteer.
 */

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const OFFICE_PREVIEW_MIMES = [DOCX_MIME, XLSX_MIME];

export const supportsOfficePreview = (mime: string) =>
  OFFICE_PREVIEW_MIMES.includes(mime);
