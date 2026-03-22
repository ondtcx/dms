// src/documents/dto/upload-document.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { toBoolean } from '../../common/helpers/transform.helper';

export class UploadDocumentDto {
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
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
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
    description: 'ID del curso al que pertenece el documento',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  courseId?: number;

  @ApiPropertyOptional({
    description: 'ID de la materia a la que pertenece el documento',
    example: 3,
  })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  subjectId?: number;
}
