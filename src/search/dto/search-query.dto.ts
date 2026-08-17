import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @ApiPropertyOptional({
    description: 'Términos de búsqueda',
    example: 'acta reunión',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({
    description: 'IDs de categorías',
    type: [Number],
    example: [1, 2],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  categoryIds?: number[];

  @ApiPropertyOptional({
    description: 'IDs de cursos',
    type: [Number],
    example: [1],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  courseIds?: number[];

  @ApiPropertyOptional({
    description: 'IDs de materias',
    type: [Number],
    example: [1],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  subjectIds?: number[];

  @ApiPropertyOptional({
    description: 'ID del usuario que subió',
    example: 'cluid123',
  })
  @IsOptional()
  @IsString()
  uploadedById?: string;

  @ApiPropertyOptional({
    description: 'Fecha de creación desde',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha de creación hasta',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Tamaño mínimo en bytes', example: 1024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSize?: number;

  @ApiPropertyOptional({
    description: 'Tamaño máximo en bytes',
    example: 10485760,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxSize?: number;

  @ApiPropertyOptional({
    description: 'Tipos MIME',
    type: [String],
    example: ['application/pdf'],
  })
  @IsOptional()
  @IsArray()
  mimetypes?: string[];

  @ApiPropertyOptional({
    description: 'Solo documentos públicos',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir eliminados',
    example: false,
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    description: 'Número de página',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Campo de ordenamiento',
    example: 'createdAt',
    default: 'relevance',
    enum: ['relevance', 'createdAt', 'updatedAt', 'filename', 'size'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'relevance';

  @ApiPropertyOptional({
    description: 'Dirección de ordenamiento',
    example: 'desc',
    default: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
