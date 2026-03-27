import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBlankDocumentDto {
  @ApiProperty({ description: 'Nombre del documento', example: 'Nuevo Documento' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Tipo de archivo a crear',
    example: 'docx',
    enum: ['docx', 'xlsx', 'pptx'],
  })
  @IsIn(['docx', 'xlsx', 'pptx'])
  fileType: 'docx' | 'xlsx' | 'pptx';

  @ApiPropertyOptional({ description: 'ID de la categoría', example: 1 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  categoryId?: number;

  @ApiPropertyOptional({ description: 'ID del curso', example: 1 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  courseId?: number;
}
