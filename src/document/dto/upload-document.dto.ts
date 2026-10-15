// src/documents/dto/upload-document.dto.ts
import { BadRequestException } from '@nestjs/common';
import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  ValidateNested,
  IsNotEmpty,
  Min,
  Validate,
  ValidateIf,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { toBoolean } from '../../common/helpers/transform.helper';
import { IsCalendarDate } from '../upload-date';

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
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== ''
      ? parseInt(value, 10)
      : undefined,
  )
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

export class DocumentMetadataDto {
  @ApiPropertyOptional({
    description: 'ID del directorio lógico de destino',
    example: 4,
  })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== ''
      ? parseInt(value, 10)
      : undefined,
  )
  directoryId?: number;

  @ApiPropertyOptional({
    description: 'Descripción del documento',
    example: 'Contrato de servicio 2024',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'ID de la categoría del documento',
    example: 2,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : value,
  )
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Si el documento es público',
    example: false,
    default: false,
  })
  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description:
      'ID del tipo de documento; null u omitido representa el tipo genérico',
    example: 3,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    return typeof value === 'string' && /^\d+$/.test(value)
      ? Number(value)
      : value;
  })
  documentTypeId?: number | null;

  @ApiPropertyOptional({ description: 'Datos académicos' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAcademicDto)
  @Transform(
    ({ value }) => {
      let academic = value;
      if (typeof academic === 'string') {
        try {
          academic = JSON.parse(academic);
        } catch {
          throw new BadRequestException(
            'Los datos académicos deben ser un objeto JSON válido',
          );
        }
      }
      if (academic === undefined || academic === null) return academic;
      if (typeof academic !== 'object' || Array.isArray(academic)) {
        throw new BadRequestException(
          'Los datos académicos deben ser un objeto JSON válido',
        );
      }
      return academic instanceof DocumentAcademicDto
        ? academic
        : plainToInstance(DocumentAcademicDto, academic);
    },
    { toClassOnly: true },
  )
  academic?: DocumentAcademicDto;

  @ApiPropertyOptional({ description: 'Datos de búsqueda' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentSearchDto)
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  search?: DocumentSearchDto;

  @ApiPropertyOptional({ description: 'Datos de plantilla' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentTemplateDataDto)
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return value;
    }
  })
  templateData?: DocumentTemplateDataDto;
}

export class UploadDocumentDto extends OmitType(DocumentMetadataDto, [
  'description',
  'documentTypeId',
  'academic',
  'search',
] as const) {
  @ApiPropertyOptional({
    description: 'Nombre del documento independiente del archivo original',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'El nombre del documento debe ser texto' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Número institucional; si se omite el documento queda sin número',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'El número institucional debe ser texto' })
  documentNumber?: string;

  @ApiPropertyOptional({
    description: 'Datos académicos heredados ignorados durante la carga',
    deprecated: true,
  })
  @Transform(() => undefined)
  @IsOptional()
  academic?: DocumentAcademicDto;

  @ApiPropertyOptional({ description: 'Descripción opcional del documento' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'ID del tipo de documento activo; null u omitido representa el tipo genérico',
  })
  @Transform(({ value }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  documentTypeId?: number | null;

  @ApiPropertyOptional({ description: 'Fecha de origen YYYY-MM-DD' })
  @ValidateIf((_object, value) => value !== undefined)
  @Validate(IsCalendarDate)
  originDate?: string;
}
