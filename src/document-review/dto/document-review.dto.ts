import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitDocumentReviewDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reviewerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reviewerName?: string;
}

export class ApproveDocumentReviewDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  observation?: string;
}

export class ReturnDocumentReviewDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  observation: string;
}
