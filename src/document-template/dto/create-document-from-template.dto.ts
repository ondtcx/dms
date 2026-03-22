import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class CreateDocumentFromTemplateDto {
  @ApiProperty({
    description: 'ID de la plantilla a usar',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  templateId: number;

  @ApiProperty({
    description: 'Datos del formulario según la definición de la plantilla',
    example: {
      titulo: 'Reunión de planificación Q1 2024',
      fecha: '2024-01-15',
      participantes: 'Juan Pérez, María García, Carlos López',
      contenido: 'Se discutieron los objetivos del primer trimestre...',
    },
  })
  @IsObject()
  @IsNotEmpty()
  formData: Record<string, any>;

  @ApiProperty({
    description: 'Nombre del archivo a generar',
    example: 'acta-reunion-2024-01-15.pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiProperty({
    description: 'Descripción del documento',
    example: 'Acta de reunión de planificación',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Si el documento es público',
    example: false,
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiProperty({
    description: 'ID de la categoría del documento',
    example: 2,
    required: false,
  })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiProperty({
    description: 'ID de la sección del documento',
    example: 1,
    required: false,
  })
  @IsInt()
  @IsOptional()
  sectionId?: number;

}
