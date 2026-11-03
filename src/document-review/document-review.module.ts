import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentReviewController } from './document-review.controller';
import { DocumentReviewService } from './document-review.service';

@Module({
  controllers: [DocumentReviewController],
  providers: [PrismaService, DocumentReviewService],
  exports: [DocumentReviewService],
})
export class DocumentReviewModule {}
