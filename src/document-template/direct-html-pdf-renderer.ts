export const DIRECT_HTML_PDF_RENDERER = Symbol('DIRECT_HTML_PDF_RENDERER');

export interface DirectHtmlPdfOptions {
  html: string;
  styles?: string;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
}

export interface DirectHtmlPdfRenderer {
  generatePDFFromHtml(options: DirectHtmlPdfOptions): Promise<Buffer>;
}
