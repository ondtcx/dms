import { readFile } from 'fs/promises';
import { PDFDocument } from 'pdf-lib';
import { supportsOfficePreview } from './office-content/office-mimetypes';

const PDF_MIME = 'application/pdf';
const IMAGE_MIME_PREFIX = 'image/';

// Formatos de imagen que pueden contener varias páginas: no se puede afirmar una.
const MULTI_PAGE_IMAGE_MIMES = new Set(['image/tiff']);

export type PdfConverter = (path: string, mimetype: string) => Promise<Buffer>;

export interface PageCountOptions {
  /** Conversión a PDF, solo usada para los formatos de Office con vista previa. */
  convertToPdf?: PdfConverter;
}

/**
 * Formatos cuyo recuento se lee del propio archivo, sin conversión previa.
 * Las imágenes se consideran una página, salvo los formatos que pueden
 * contener varias.
 */
export const canReadPageCountDirectly = (mimetype: string) =>
  mimetype === PDF_MIME ||
  (mimetype.startsWith(IMAGE_MIME_PREFIX) &&
    !MULTI_PAGE_IMAGE_MIMES.has(mimetype));

async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  try {
    // ignoreEncryption deja leer la estructura de un PDF cifrado, donde el
    // recuento de páginas sigue siendo fiable.
    const parsed = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = parsed.getPageCount();
    return Number.isInteger(total) && total > 0 ? total : null;
  } catch {
    return null;
  }
}

/**
 * Cuenta las páginas de una versión almacenada sin poder fallar la carga.
 * Cualquier duda (formato no medible, archivo ilegible, conversión fallida)
 * devuelve null: es preferible no mostrar nada que mostrar un número inventado.
 */
export async function readVersionPageCount(
  path: string,
  mimetype: string,
  options: PageCountOptions = {},
): Promise<number | null> {
  try {
    if (canReadPageCountDirectly(mimetype)) {
      if (mimetype !== PDF_MIME) return 1;
      return await countPdfPages(await readFile(path));
    }
    if (!options.convertToPdf || !supportsOfficePreview(mimetype)) return null;
    return await countPdfPages(await options.convertToPdf(path, mimetype));
  } catch {
    return null;
  }
}
