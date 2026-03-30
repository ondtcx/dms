import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class UpdateDocumentFromTemplateDto {
  @ApiProperty({
    description:
      'Datos del formulario actualizados según la definición de la plantilla',
    example: {
      titulo: 'Reunión de planificación Q2 2024',
      fecha: '2024-04-15',
      participantes: 'Juan Pérez, María García',
      contenido: 'Se discutieron los objetivos del segundo trimestre...',
    },
  })
  @IsObject()
  @IsNotEmpty()
  formData: Record<string, any>;

  @ApiProperty({
    description: 'Nuevo nombre del archivo',
    example: 'acta-reunion-2024-04-15.pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiProperty({
    description: 'Nueva descripción del documento',
    example: 'Acta de reunión de planificación Q2',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Si el documento es público',
    example: false,
    required: false,
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
}
