import { Module } from '@nestjs/common';
import { DocumentGeneratorService } from '../../document-template/document-generator.service';
import { DIRECT_HTML_PDF_RENDERER } from '../../document-template/direct-html-pdf-renderer';
import { OfficeContentService } from './office-content.service';
import { DOCX_PDF_RENDERER } from './docx-pdf-renderer';
import { DocxPreviewRendererService } from './docx-preview-renderer.service';

@Module({
  providers: [
    DocumentGeneratorService,
    {
      provide: DIRECT_HTML_PDF_RENDERER,
      useExisting: DocumentGeneratorService,
    },
    OfficeContentService,
    DocxPreviewRendererService,
    { provide: DOCX_PDF_RENDERER, useExisting: DocxPreviewRendererService },
  ],
  exports: [OfficeContentService],
})
export class OfficeContentModule {}
