import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentReviewController } from './document-review.controller';
import { DocumentReviewService } from './document-review.service';

@Module({
  imports: [AuditModule],
  controllers: [DocumentReviewController],
  providers: [PrismaService, DocumentReviewService],
  exports: [DocumentReviewService],
})
export class DocumentReviewModule {}
