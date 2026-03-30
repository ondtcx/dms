import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BatchRowDto {
  @ApiProperty({
    description: 'Datos del formulario para este documento',
    example: { titulo: 'Constancia de Juan Pérez', fecha: '2026-03-18' },
  })
  @IsObject()
  @IsNotEmpty()
  formData: Record<string, any>;

  @ApiProperty({
    description:
      'Nombre del archivo (opcional, se genera automáticamente si no se indica)',
    example: 'constancia-juan-perez.pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiProperty({
    description: 'Descripción del documento (opcional)',
    example: 'Constancia de estudios para Juan Pérez',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateBatchFromTemplateDto {
  @ApiProperty({ description: 'ID de la plantilla a usar', example: 1 })
  @IsInt()
  @IsNotEmpty()
  templateId: number;

  @ApiProperty({
    description: 'Nombre descriptivo del lote',
    example: 'Constancias Grado 5° - Marzo 2026',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  batchName?: string;

  @ApiProperty({
    description: 'Filas de datos para generar (máximo 50)',
    type: [BatchRowDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BatchRowDto)
  rows: BatchRowDto[];

  @ApiProperty({
    description: 'ID de categoría compartida para todos los documentos',
    required: false,
  })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiProperty({
    description: 'ID de sección compartida para todos los documentos',
    required: false,
  })
  @IsInt()
  @IsOptional()
  sectionId?: number;

  @ApiProperty({
    description: 'Si los documentos generados son públicos',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
