import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ValidateWorkflowVersionDto {
  @ApiPropertyOptional({ default: 'strict' })
  @IsOptional()
  @IsString()
  mode?: string;
}
