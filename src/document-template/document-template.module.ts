import { Module } from '@nestjs/common';
import { DocumentTemplateService } from './document-template.service';
import { DocumentTemplateController } from './document-template.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DocumentTemplateController],
  providers: [DocumentTemplateService, PrismaService],
  exports: [DocumentTemplateService],
})
export class DocumentTemplateModule {}
