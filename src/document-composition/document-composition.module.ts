import { Module } from '@nestjs/common';
import { DocumentCompositionController } from './document-composition.controller';
import { DocumentCompositionService } from './document-composition.service';
import { PdfMergeService } from './pdf-merge.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentTemplateModule } from '../document-template/document-template.module';

@Module({
  imports: [DocumentTemplateModule],
  controllers: [DocumentCompositionController],
  providers: [DocumentCompositionService, PdfMergeService, PrismaService],
  exports: [DocumentCompositionService],
})
export class DocumentCompositionModule {}
