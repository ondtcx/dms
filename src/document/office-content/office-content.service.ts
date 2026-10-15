import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { open } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import sanitizeHtml from 'sanitize-html';
import {
  DIRECT_HTML_PDF_RENDERER,
  DirectHtmlPdfRenderer,
} from '../../document-template/direct-html-pdf-renderer';
import { OFFICE_WORKER_SOURCE } from './office-content.worker';
import { sanitizeSpreadsheetHtml } from './xlsx-presentation';
import { validateOfficeZip } from './office-package-policy';
import { DOCX_PDF_RENDERER, DocxPdfRenderer } from './docx-pdf-renderer';
import {
  DOCX_MIME,
  XLSX_MIME,
  supportsOfficePreview,
} from './office-mimetypes';
export { validateOfficeZip } from './office-package-policy';
export {
  DOCX_MIME,
  XLSX_MIME,
  supportsOfficePreview,
} from './office-mimetypes';

export function sanitizeOfficeHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'blockquote',
      'img',
    ],
    allowedAttributes: {
      img: ['src', 'alt'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: [],
    allowProtocolRelative: false,
    parseStyleAttributes: false,
    nestingLimit: 100,
    allowedSchemesByTag: { img: ['data'] },
    transformTags: {
      img: (_tag, attrs) => {
        const valid =
          /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(
            attrs.src || '',
          ) && (attrs.src || '').length <= 1400000;
        return {
          tagName: 'img',
          attribs: valid ? { src: attrs.src, alt: attrs.alt || '' } : {},
        };
      },
    },
  });
}

@Injectable()
export class OfficeContentService {
  private active = 0;
  constructor(
    @Inject(DIRECT_HTML_PDF_RENDERER)
    private readonly renderer: DirectHtmlPdfRenderer,
    @Inject(DOCX_PDF_RENDERER)
    private readonly docxRenderer: DocxPdfRenderer,
  ) {}

  async convert(path: string, mime: string): Promise<Buffer> {
    if (!supportsOfficePreview(mime))
      throw new BadRequestException(
        'Formato no compatible con la vista previa básica. Descarga el original.',
      );
    if (this.active >= 2)
      throw new ServiceUnavailableException(
        'Conversión ocupada; intenta nuevamente.',
      );
    this.active++;
    try {
      const file = await open(path, 'r');
      let bytes: Buffer;
      try {
        if ((await file.stat()).size > 10 * 1024 * 1024)
          throw new Error('El archivo supera el límite de 10 MiB');
        bytes = Buffer.alloc(10 * 1024 * 1024 + 1);
        let total = 0;
        while (total < bytes.length) {
          const { bytesRead } = await file.read(
            bytes,
            total,
            bytes.length - total,
            total,
          );
          if (!bytesRead) break;
          total += bytesRead;
        }
        bytes = bytes.subarray(0, total);
      } finally {
        await file.close();
      }
      validateOfficeZip(bytes);
      if (mime === DOCX_MIME) {
        const pdf = await this.docxRenderer.render(bytes);
        if (!pdf.length || pdf.length > 20 * 1024 * 1024)
          throw new Error('El PDF supera el límite de 20 MiB');
        return pdf;
      }
      const presentation = await this.parse(bytes, mime);
      const pdf = await this.renderer.generatePDFFromHtml({
        html:
          mime === XLSX_MIME
            ? sanitizeSpreadsheetHtml(presentation.html)
            : sanitizeOfficeHtml(presentation.html),
        untrusted: true,
        styles:
          mime === XLSX_MIME
            ? presentation.styles
            : 'table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #888;overflow-wrap:anywhere;font-size:9pt}img{max-width:100%;max-height:900px}h1{break-before:page}h1:first-child{break-before:auto}',
      });
      if (!pdf.length || pdf.length > 20 * 1024 * 1024)
        throw new Error('El PDF supera el límite de 20 MiB');
      return pdf;
    } catch (error) {
      throw new BadRequestException(
        `No se pudo generar la vista previa básica: ${error instanceof Error ? error.message : 'archivo no válido'}`,
      );
    } finally {
      this.active--;
    }
  }

  private parse(
    bytes: Buffer,
    mime: string,
  ): Promise<{ html: string; styles?: string }> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(OFFICE_WORKER_SOURCE, {
        eval: true,
        workerData: { bytes, kind: mime === DOCX_MIME ? 'docx' : 'xlsx' },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
        },
      });
      const finish = (
        error?: Error,
        presentation?: { html: string; styles?: string },
      ) => {
        clearTimeout(timer);
        worker.removeAllListeners();
        void worker
          .terminate()
          .then(() => (error ? reject(error) : resolve(presentation)));
      };
      const timer = setTimeout(
        () => finish(new Error('El análisis superó el límite de 15 segundos')),
        15000,
      );
      worker.once('message', (result) =>
        finish(result.error ? new Error(result.error) : undefined, result),
      );
      worker.once('error', (error) => finish(error));
      worker.once('exit', () =>
        finish(new Error('El análisis terminó sin resultado')),
      );
    });
  }
}
