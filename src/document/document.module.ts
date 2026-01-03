// src/documents/documents.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { ThumbnailService } from './thumbnail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { DocumentTemplateModule } from '../document-template/document-template.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
    DocumentTemplateModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService, ThumbnailService, PrismaService],
  exports: [DocumentService],
})
export class DocumentModule {}
