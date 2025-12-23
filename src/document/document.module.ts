// src/documents/documents.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { DocumentTemplateService } from '../document-template/document-template.service';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
    }),
  ],
  controllers: [DocumentController],
  providers: [DocumentService, PrismaService, DocumentTemplateService],
  exports: [DocumentService],
})
export class DocumentModule {}
