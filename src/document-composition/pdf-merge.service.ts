import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentGeneratorService } from '../document-template/document-generator.service';

@Injectable()
export class PdfMergeService {
  private readonly logger = new Logger(PdfMergeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: DocumentGeneratorService,
  ) {}

  async merge(parentId: number): Promise<Buffer> {
    const components = await this.prisma.documentCompositionItem.findMany({
      where: {
        parentId,
        child: { deletedAt: null },
      },
      orderBy: { order: 'asc' },
      include: {
        child: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
            path: true,
            templateId: true,
            formData: true,
          },
        },
      },
    });

    if (components.length === 0) {
      throw new BadRequestException('El documento compuesto no tiene componentes activos');
    }

    const mergedPdf = await PDFDocument.create();

    for (const comp of components) {
      const { child } = comp;

      try {
        let pdfBytes: Buffer;

        if (child.templateId !== null && child.formData !== null) {
          // Documento generado desde plantilla: regenerar PDF con datos actuales
          const template = await this.prisma.documentTemplate.findUnique({
            where: { id: child.templateId },
            select: { htmlTemplate: true, styles: true, pageSize: true, orientation: true },
          });

          if (!template) {
            this.logger.warn(`Plantilla ${child.templateId} no encontrada para documento ${child.id}, saltando`);
            continue;
          }

          pdfBytes = await this.generator.generatePDF({
            htmlTemplate: template.htmlTemplate,
            styles: template.styles ?? undefined,
            data: child.formData as Record<string, any>,
            pageSize: (template.pageSize as 'A4' | 'Letter' | 'Legal') ?? 'A4',
            orientation: (template.orientation as 'portrait' | 'landscape') ?? 'portrait',
          });
        } else if (child.mimetype === 'application/pdf') {
          // PDF subido directamente: leer desde disco
          if (!fs.existsSync(child.path)) {
            throw new BadRequestException(
              `El archivo del documento "${child.filename}" (ID: ${child.id}) no se encontró en el servidor`,
            );
          }
          pdfBytes = fs.readFileSync(child.path);
        } else {
          // DOCX/XLSX/otro: no incluir en el merge físico
          this.logger.log(`Documento "${child.filename}" (${child.mimetype}) omitido del merge — solo referencia`);
          continue;
        }

        const srcDoc = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        pages.forEach((page) => mergedPdf.addPage(page));
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        this.logger.error(`Error procesando documento "${child.filename}" (ID: ${child.id}):`, err);
        throw new BadRequestException(
          `Error al procesar el documento "${child.filename}": ${err.message}`,
        );
      }
    }

    const pdfBytes = await mergedPdf.save();
    return Buffer.from(pdfBytes);
  }
}
