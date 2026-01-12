import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Contenido del comentario (soporta @mentions)',
    example: 'Este documento está correcto @juan.perez',
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'ID del comentario padre (para respuestas)',
    example: 123,
  })
  @IsInt()
  @IsOptional()
  parentId?: number;

  @ApiPropertyOptional({
    description: 'Datos de anotación en PDF',
    example: { x: 100, y: 200, width: 150, height: 50, page: 1, type: 'highlight' },
  })
  @IsObject()
  @IsOptional()
  annotationData?: {
    x: number;
    y: number;
    width: number;
    height: number;
    page: number;
    type: 'highlight' | 'note' | 'drawing';
  };
}
