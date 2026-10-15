import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import { DocumentGeneratorService } from '../document-template/document-generator.service';
import { DocumentCompositionService } from './document-composition.service';

@Injectable()
export class PdfMergeService {
  private readonly logger = new Logger(PdfMergeService.name);

  constructor(
    private readonly generator: DocumentGeneratorService,
    private readonly compositionService: DocumentCompositionService,
  ) {}

  async merge(parentId: number, actorId: string): Promise<Buffer> {
    // La autorización se resuelve antes de leer archivos o generar plantillas.
    // La selección devuelta es inmutable y se revalida antes de entregar bytes.
    const snapshot = await this.compositionService.authorizeMergeSnapshot(
      parentId,
      actorId,
    );

    const mergedPdf = await PDFDocument.create();

    for (const comp of snapshot.components) {
      const { child } = comp;

      try {
        let pdfBytes: Buffer;
        const templateData = child.templateData;

        if (templateData?.templateId != null && templateData?.formData != null) {
          // Documento generado desde plantilla: regenerar PDF con datos actuales
          const template = templateData.template;

          if (!template) {
            this.logger.warn(
              `Plantilla ${templateData.templateId} no encontrada para documento ${child.id}, saltando`,
            );
            continue;
          }

          pdfBytes = await this.generator.generatePDF({
            htmlTemplate: template.htmlTemplate,
            styles: template.styles ?? undefined,
            data: templateData.formData as Record<string, any>,
            pageSize: (template.pageSize as 'A4' | 'Letter' | 'Legal') ?? 'A4',
            orientation:
              (template.orientation as 'portrait' | 'landscape') ?? 'portrait',
          });
        } else if (child.versions?.[0]?.mimetype === 'application/pdf') {
          // PDF subido directamente: leer desde disco
          if (!fs.existsSync(child.versions?.[0]?.path)) {
            throw new BadRequestException(
              `El archivo del documento "${child.versions?.[0]?.filename}" (ID: ${child.id}) no se encontró en el servidor`,
            );
          }
          pdfBytes = fs.readFileSync(child.versions?.[0]?.path);
        } else {
          // DOCX/XLSX/otro: no incluir en el merge físico
          this.logger.log(
            `Documento "${child.versions?.[0]?.filename}" (${child.versions?.[0]?.mimetype}) omitido del merge — solo referencia`,
          );
          continue;
        }

        const srcDoc = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(
          srcDoc,
          srcDoc.getPageIndices(),
        );
        pages.forEach((page) => mergedPdf.addPage(page));
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        this.logger.error(
          `Error procesando documento "${child.versions?.[0]?.filename}" (ID: ${child.id}):`,
          err,
        );
        throw new BadRequestException(
          `Error al procesar el documento "${child.versions?.[0]?.filename}": ${err.message}`,
        );
      }
    }

    const pdfBytes = await mergedPdf.save();

    // Revalidación final: si la autorización, el origen o el grafo/versión
    // cambiaron durante la generación, se falla cerrado sin publicar el búfer.
    await this.compositionService.recheckMergeSnapshot(
      parentId,
      actorId,
      snapshot.signature,
    );

    return Buffer.from(pdfBytes);
  }
}
