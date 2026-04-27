// src/documents/dto/upload-document.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PilotDocumentStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
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
  @ApiPropertyOptional({ description: 'Título del documento', example: 'Solicitud de permiso' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Descripción del documento', example: 'Contrato de servicio 2024' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Fecha propia del documento', example: '2026-04-22' })
  @IsDateString()
  @IsOptional()
  documentDate?: string;

  @ApiPropertyOptional({ description: 'Remitente del documento', example: 'Secretaría General' })
  @IsString()
  @IsOptional()
  sender?: string;

  @ApiPropertyOptional({ description: 'Destinatario del documento', example: 'Rectorado' })
  @IsString()
  @IsOptional()
  recipient?: string;

  @ApiPropertyOptional({ description: 'Palabras clave separadas por comas', example: 'permiso, docente, abril' })
  @IsString()
  @IsOptional()
  keywords?: string;

  @ApiPropertyOptional({
    description: 'Estado del documento para el piloto de secretaría',
    enum: PilotDocumentStatus,
    example: PilotDocumentStatus.REGISTRADO,
  })
  @IsEnum(PilotDocumentStatus)
  @IsOptional()
  status?: PilotDocumentStatus;

  @ApiPropertyOptional({ description: 'Edificio donde se archiva el documento', example: 'Edificio principal' })
  @IsString()
  @IsOptional()
  physicalBuilding?: string;

  @ApiPropertyOptional({ description: 'Oficina donde se archiva el documento', example: 'Secretaría' })
  @IsString()
  @IsOptional()
  physicalOffice?: string;

  @ApiPropertyOptional({ description: 'Archivo o estante físico', example: 'Archivo A' })
  @IsString()
  @IsOptional()
  physicalArchive?: string;

  @ApiPropertyOptional({ description: 'Gaveta o caja física', example: 'Gaveta 2' })
  @IsString()
  @IsOptional()
  physicalBox?: string;

  @ApiPropertyOptional({ description: 'Observaciones de ubicación física', example: 'Carpeta azul con separador rojo' })
  @IsString()
  @IsOptional()
  physicalNotes?: string;

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

  @ApiPropertyOptional({ description: 'ID del subtipo de documento (DocumentType)', example: 3 })
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
