import { Module, forwardRef } from '@nestjs/common';
import { DocumentTemplateService } from './document-template.service';
import { DocumentTemplateController } from './document-template.controller';
import { DocumentGeneratorService } from './document-generator.service';
import { DIRECT_HTML_PDF_RENDERER } from './direct-html-pdf-renderer';
import { PrismaService } from '../prisma/prisma.service';
import { ThumbnailService } from '../document/thumbnail.service';
import { DocumentNumberingService } from '../document/document-numbering.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [DocumentTemplateController],
  providers: [
    DocumentTemplateService,
    DocumentGeneratorService,
    { provide: DIRECT_HTML_PDF_RENDERER, useExisting: DocumentGeneratorService },
    PrismaService,
    ThumbnailService,
    DocumentNumberingService,
  ],
  exports: [
    DocumentTemplateService,
    DocumentGeneratorService,
    DIRECT_HTML_PDF_RENDERER,
  ],
})
export class DocumentTemplateModule {}
