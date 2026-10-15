import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  IsIn,
  IsInt,
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
      ],
    },
  })
  @IsObject()
  @IsNotEmpty()
  fields: Record<string, any>;

  @ApiProperty({
    description: 'Plantilla HTML con Handlebars para generar el documento',
    example: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{titulo}}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>{{titulo}}</h1>
  <p><strong>Fecha:</strong> {{fecha}}</p>
  <p><strong>Participantes:</strong> {{participantes}}</p>
  <div>{{contenido}}</div>
</body>
</html>`,
  })
  @IsString()
  @IsNotEmpty()
  htmlTemplate: string;

  @ApiProperty({
    description: 'CSS personalizado adicional para el documento',
    example: `h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
p { line-height: 1.6; }`,
    required: false,
  })
  @IsString()
  @IsOptional()
  styles?: string;

  @ApiProperty({
    description: 'Formato de salida del documento',
    example: 'pdf',
    enum: ['pdf', 'docx', 'html'],
    default: 'pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsIn(['pdf', 'docx', 'html'])
  outputFormat?: string;

  @ApiProperty({
    description: 'Tamaño de página',
    example: 'A4',
    enum: ['A4', 'Letter', 'Legal'],
    default: 'A4',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsIn(['A4', 'Letter', 'Legal'])
  pageSize?: string;

  @ApiProperty({
    description: 'Orientación de la página',
    example: 'portrait',
    enum: ['portrait', 'landscape'],
    default: 'portrait',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsIn(['portrait', 'landscape'])
  orientation?: string;

  @ApiProperty({
    description: 'Si la plantilla está activa',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'ID de la categoría a la que pertenece esta plantilla',
    example: 1,
    required: false,
  })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiProperty({
    description:
      'ID del tipo de documento (DocumentType) al que pertenece esta plantilla',
    example: 3,
    required: false,
  })
  @IsInt()
  @IsOptional()
  documentTypeId?: number;
}
