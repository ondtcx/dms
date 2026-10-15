export const DOCX_PDF_RENDERER = Symbol('DOCX_PDF_RENDERER');

export interface DocxPdfRenderer {
  render(bytes: Buffer): Promise<Buffer>;
}
