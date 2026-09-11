// src/documents/dto/upload-document.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toBoolean } from '../../common/helpers/transform.helper';

export class DocumentAcademicDto {
  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  courseId?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  subjectId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : undefined))
  academicYearId?: number;
}

export class DocumentTemplateDataDto {
  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  templateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  formData?: any;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  batchId?: string;
}

export class DocumentSearchDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  extractedText?: string;
}

export class UploadDocumentDto {
  @ApiPropertyOptional({ description: 'ID del directorio lógico de destino', example: 4 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : undefined))
  directoryId?: number;

  @ApiPropertyOptional({ description: 'Descripción del documento', example: 'Contrato de servicio 2024' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'ID de la categoría del documento', example: 2 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Si el documento es público', example: false, default: false })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'ID del tipo de documento', example: 3 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  documentTypeId?: number;

  @ApiPropertyOptional({ description: 'Datos académicos' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAcademicDto)
  @Transform(({ value }) => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
  })
  academic?: DocumentAcademicDto;

  @ApiPropertyOptional({ description: 'Datos de búsqueda' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentSearchDto)
  @Transform(({ value }) => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
  })
  search?: DocumentSearchDto;

  @ApiPropertyOptional({ description: 'Datos de plantilla' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentTemplateDataDto)
  @Transform(({ value }) => {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return value; }
  })
  templateData?: DocumentTemplateDataDto;
}
