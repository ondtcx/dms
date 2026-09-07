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

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
    DocumentTemplateModule,
    SettingsModule,
    DirectoryModule,
    forwardRef(() => WorkflowModule),
  ],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    ThumbnailService,
    PrismaService,
    DocumentNumberingService,
  ],
  exports: [
    DocumentService,
    ThumbnailService,
    DocumentNumberingService,
    DocumentModule,
  ],
})
export class DocumentModule {}
