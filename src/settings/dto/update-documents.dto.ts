import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDocumentsDto {
  @ApiPropertyOptional({
    example: 50,
    description: 'Tamaño máximo de archivo en MB',
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(500)
  maxFileSizeMb?: number;

  @ApiPropertyOptional({
    example: ['application/pdf', 'image/jpeg'],
    description: 'Tipos MIME permitidos para subir',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedMimeTypes?: string[];

  @ApiPropertyOptional({
    example: 30,
    description:
      'Días de retención en papelera antes de eliminar definitivamente',
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(365)
  trashRetentionDays?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Días de retención de versiones históricas desde su sustitución',
  })
  @IsInt({ message: 'Los días de retención deben ser un entero' })
  @ValidateIf((_object, value) => value !== undefined)
  @Min(1, { message: 'La retención mínima es de 1 día' })
  @Max(3650, { message: 'La retención máxima es de 3650 días' })
  versionRetentionDays?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Valor legado de compatibilidad; no elimina versiones',
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  maxVersionsPerDocument?: number;
}
