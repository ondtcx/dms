import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateAuthoringTemplateDto {
  @ApiProperty({ example: 'Oficio institucional' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Cuerpo HTML con variables Handlebars' })
  @IsString()
  @IsNotEmpty()
  bodyHtml: string;

  @ApiPropertyOptional({ description: 'CSS del documento' })
  @IsString()
  @IsOptional()
  styles?: string;

  @ApiPropertyOptional({
    description: 'HTML del encabezado repetido en cada página',
  })
  @IsString()
  @IsOptional()
  headerHtml?: string;

  @ApiPropertyOptional({
    description: 'HTML del pie repetido en cada página',
  })
  @IsString()
  @IsOptional()
  footerHtml?: string;

  @ApiPropertyOptional({ example: '3.2cm' })
  @IsString()
  @IsOptional()
  marginTop?: string;

  @ApiPropertyOptional({ example: '3cm' })
  @IsString()
  @IsOptional()
  marginBottom?: string;

  @ApiPropertyOptional({ example: '2cm' })
  @IsString()
  @IsOptional()
  marginLeft?: string;

  @ApiPropertyOptional({ example: '2cm' })
  @IsString()
  @IsOptional()
  marginRight?: string;

  @ApiProperty({ description: 'Definición de campos', example: { fields: [] } })
  @IsObject()
  fields: Record<string, any>;

  @ApiPropertyOptional({ enum: ['A4', 'Letter', 'Legal'], default: 'A4' })
  @IsIn(['A4', 'Letter', 'Legal'])
  @IsOptional()
  pageSize?: string;

  @ApiPropertyOptional({ enum: ['portrait', 'landscape'], default: 'portrait' })
  @IsIn(['portrait', 'landscape'])
  @IsOptional()
  orientation?: string;

  @ApiProperty({ example: 'OFI' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  numberPrefix: string;
}

export class UpdateAuthoringTemplateDto extends PartialType(
  CreateAuthoringTemplateDto,
) {}

export class CreateAuthoringTemplateVersionDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  styles?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  headerHtml?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  footerHtml?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  marginTop?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  marginBottom?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  marginLeft?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  marginRight?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  fields?: Record<string, any>;

  @ApiPropertyOptional({ enum: ['A4', 'Letter', 'Legal'] })
  @IsIn(['A4', 'Letter', 'Legal'])
  @IsOptional()
  pageSize?: string;

  @ApiPropertyOptional({ enum: ['portrait', 'landscape'] })
  @IsIn(['portrait', 'landscape'])
  @IsOptional()
  orientation?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  numberPrefix?: string;
}

export class CreateAuthoringDocumentDto {
  @ApiProperty()
  @IsInt()
  templateVersionId: number;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  formData?: Record<string, any>;
}

export class SaveAuthoringDraftDto {
  @ApiProperty()
  @IsObject()
  formData: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Crea un snapshot de contenido además de actualizar el borrador',
  })
  @IsBoolean()
  @IsOptional()
  createVersion?: boolean;
}

export class SubmitAuthoringDocumentDto {
  @ApiPropertyOptional({ description: 'Revisor elegido manualmente' })
  @IsString()
  @IsOptional()
  reviewerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reviewerName?: string;
}

export class ReviewAuthoringDocumentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  observation?: string;
}

export class ReturnAuthoringDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  observation: string;
}

export class BatchRecipientDto {
  @ApiProperty()
  @IsObject()
  formData: Record<string, any>;
}

export class CreateAuthoringBatchDto {
  @ApiProperty()
  @IsInt()
  templateVersionId: number;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  commonFormData?: Record<string, any>;

  @ApiProperty({ type: [BatchRecipientDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BatchRecipientDto)
  recipients: BatchRecipientDto[];
}
