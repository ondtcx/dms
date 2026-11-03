import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentReviewService } from './document-review.service';
import {
  ApproveDocumentReviewDto,
  ReturnDocumentReviewDto,
  SubmitDocumentReviewDto,
} from './dto/document-review.dto';

@ApiTags('document-reviews')
@ApiBearerAuth('JWT-auth')
@Controller('document-reviews')
export class DocumentReviewController {
  constructor(private readonly reviews: DocumentReviewService) {}

  @Get('pending')
  pending() {
    return this.reviews.pending();
  }

  @Get(':documentId')
  get(@Param('documentId', ParseIntPipe) documentId: number) {
    return this.reviews.get(documentId);
  }

  @Post(':documentId/submit')
  submit(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: SubmitDocumentReviewDto,
    @CurrentUser() user: any,
  ) {
    return this.reviews.submit(documentId, user, dto.reviewerId, dto.reviewerName);
  }

  @Post(':documentId/approve')
  approve(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: ApproveDocumentReviewDto,
    @CurrentUser() user: any,
  ) {
    return this.reviews.approve(documentId, user, dto.observation);
  }

  @Post(':documentId/return')
  returnDocument(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: ReturnDocumentReviewDto,
    @CurrentUser() user: any,
  ) {
    return this.reviews.returnDocument(documentId, user, dto.observation);
  }
}
