import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
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
    example: 10,
    description: 'Número máximo de versiones por documento',
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  maxVersionsPerDocument?: number;
}
