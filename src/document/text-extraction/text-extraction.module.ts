import { Module } from '@nestjs/common';
import { TextExtractionService } from './text-extraction.service';
import { PdfOcrService } from './pdf-ocr.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [PrismaService, PdfOcrService, { provide: TextExtractionService, useFactory: () => new TextExtractionService() }],
  exports: [TextExtractionService, PdfOcrService],
})
export class TextExtractionModule {}
