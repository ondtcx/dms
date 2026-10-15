import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeContentService } from './office-content/office-content.service';
import { supportsOfficePreview } from './office-content/office-mimetypes';
import { readVersionPageCount, type PdfConverter } from './page-count';

export interface PageCountTarget {
  id: number;
  path: string;
  mimetype: string;
}

/**
 * Recuento de páginas por versión. Es un metadato derivado: se calcula después
 * de confirmar la escritura y su ausencia nunca es un error.
 */
@Injectable()
export class DocumentPageCountService {
  private readonly logger = new Logger(DocumentPageCountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly officeContent: OfficeContentService,
  ) {}

  // Solo los formatos con vista previa se convierten a PDF para contarlos.
  private readonly convertToPdf: PdfConverter = (path, mimetype) =>
    supportsOfficePreview(mimetype)
      ? this.officeContent.convert(path, mimetype)
      : Promise.reject(new Error('Formato sin conversión a PDF'));

  read(target: PageCountTarget): Promise<number | null> {
    return readVersionPageCount(target.path, target.mimetype, {
      convertToPdf: this.convertToPdf,
    });
  }

  /**
   * Mide y guarda el recuento de una versión ya confirmada y devuelve el valor
   * guardado, o null cuando no se pudo medir ni guardar. Nunca lanza: la carga
   * del documento no depende de este dato.
   */
  async record(target: PageCountTarget): Promise<number | null> {
    try {
      const pageCount = await this.read(target);
      if (pageCount === null) return null;
      await this.prisma.documentVersion.update({
        where: { id: target.id },
        data: { pageCount },
      });
      return pageCount;
    } catch (error) {
      this.logger.warn(
        `No se pudo contar las páginas de la versión ${target.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }
}
