import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Un ID concreto solo es válido como entero positivo; la cadena vacía es una
// omisión de multipart, null es ausencia explícita de tipo y cualquier otro
// valor malformado se conserva para que la validación lo rechace en lugar de
// convertirlo silenciosamente en el tipo genérico.
function parseConcreteId(value: unknown): unknown {
  if (value === '' || value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class CreateBlankDocumentDto {
  @ApiProperty({
    description: 'Nombre del documento',
    example: 'Nuevo Documento',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Tipo de archivo a crear',
    example: 'docx',
    enum: ['docx', 'xlsx', 'pptx', 'txt', 'md'],
  })
  @IsIn(['docx', 'xlsx', 'pptx', 'txt', 'md'])
  fileType: 'docx' | 'xlsx' | 'pptx' | 'txt' | 'md';

  @ApiPropertyOptional({ description: 'ID de la categoría', example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseConcreteId(value))
  categoryId?: number;

  @ApiPropertyOptional({ description: 'ID del curso', example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseConcreteId(value))
  courseId?: number;

  @ApiPropertyOptional({
    description:
      'ID del tipo de documento; null u omitido representa el tipo genérico',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => parseConcreteId(value))
  documentTypeId?: number | null;
}
