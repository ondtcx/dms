import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateWorkflowDefinitionMetadataDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  allowedInitiatorRoles?: string[];
}
