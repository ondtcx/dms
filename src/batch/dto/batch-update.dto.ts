import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class BatchUpdateDto {
  @ApiProperty({ description: 'IDs de los documentos a actualizar', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  documentIds: number[];

  @ApiPropertyOptional({ description: 'Nueva categoría ID' })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ description: 'Nueva sección ID' })
  @IsOptional()
  @IsInt()
  sectionId?: number;

  @ApiPropertyOptional({ description: 'Nuevo curso ID' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'Nueva materia ID' })
  @IsOptional()
  @IsInt()
  subjectId?: number;

  @ApiPropertyOptional({ description: 'Nueva descripción' })
  @IsOptional()
  @IsString()
  description?: string;
}
