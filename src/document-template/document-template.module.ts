import { Module } from '@nestjs/common';
import { DocumentTemplateService } from './document-template.service';
import { DocumentTemplateController } from './document-template.controller';
import { DocumentGeneratorService } from './document-generator.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DocumentTemplateController],
  providers: [DocumentTemplateService, DocumentGeneratorService, PrismaService],
  exports: [DocumentTemplateService, DocumentGeneratorService],
})
export class DocumentTemplateModule {}
