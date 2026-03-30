// src/documents/documents.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { ThumbnailService } from './thumbnail.service';
import { DocumentNumberingService } from './document-numbering.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DocumentTemplateModule } from '../document-template/document-template.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
    DocumentTemplateModule,
    SettingsModule,
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
