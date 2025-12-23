import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
} from 'class-validator';

export class CreateDocumentTemplateDto {
  @ApiProperty({
    description: 'Nombre de la plantilla',
    example: 'Acta de Reunión',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Tipo de documento',
    example: 'acta',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'Descripción de la plantilla',
    example: 'Plantilla para actas de reunión',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Definición de campos del formulario en formato JSON',
    example: {
      fields: [
        {
          name: 'titulo',
          label: 'Título de la reunión',
          type: 'text',
          required: true,
        },
        {
          name: 'fecha',
          label: 'Fecha',
          type: 'date',
          required: true,
        },
        {
          name: 'participantes',
          label: 'Participantes',
          type: 'textarea',
          required: true,
        },
        {
          name: 'contenido',
          label: 'Contenido',
          type: 'textarea',
          required: true,
        },
      ],
    },
  })
  @IsObject()
  @IsNotEmpty()
  fields: Record<string, any>;

  @ApiProperty({
    description: 'Si la plantilla está activa',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
