import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import { TextExtractionModule } from './text-extraction.module';
import { TextExtractionService } from './text-extraction.service';
import { PdfOcrService } from './pdf-ocr.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({ imports: [TextExtractionModule] })
class ConsumerModule {}

describe('TextExtractionModule', () => {
  it('exports both services with injected Prisma and unchanged digital service factory', async () => {
    const prisma = {};
    const module = await Test.createTestingModule({ imports: [ConsumerModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    expect(module.get(PdfOcrService)).toBeInstanceOf(PdfOcrService);
    expect(module.get(TextExtractionService)).toBeInstanceOf(TextExtractionService);
    expect(module.get(PrismaService)).toBe(prisma);
    const exports = Reflect.getMetadata('exports', TextExtractionModule);
    expect(exports).toEqual([TextExtractionService, PdfOcrService]);
    await module.close();
  });
});
