// src/documents/documents.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { ThumbnailService } from './thumbnail.service';
import { DocumentNumberingService } from './document-numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentTemplateModule } from '../document-template/document-template.module';
import { SettingsModule } from '../settings/settings.module';
import { DirectoryModule } from '../directory/directory.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { OfficeContentModule } from './office-content/office-content.module';
import { DocumentPageCountService } from './document-page-count.service';
import { DocumentPreviewController } from './document-preview.controller';
import { TextExtractionModule } from './text-extraction/text-extraction.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    OfficeContentModule,
    TextExtractionModule,
    MulterModule.register({
      dest: './uploads',
    }),
    DocumentTemplateModule,
    SettingsModule,
    DirectoryModule,
    AuditModule,
    forwardRef(() => WorkflowModule),
  ],
  controllers: [DocumentController, DocumentPreviewController],
  providers: [
    DocumentService,
    ThumbnailService,
    PrismaService,
    DocumentNumberingService,
    DocumentPageCountService,
  ],
  exports: [
    DocumentService,
    ThumbnailService,
    DocumentPageCountService,
    DocumentNumberingService,
    DocumentModule,
  ],
})
export class DocumentModule {}
