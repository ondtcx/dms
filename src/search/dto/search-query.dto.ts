import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsArray,
  IsBoolean,
  IsIn,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

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
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  categoryIds?: number[];

  @ApiPropertyOptional({
    description: 'IDs de tipos documentales institucionales',
    type: [Number],
    example: [1, 2],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  documentTypeIds?: number[];

  @ApiPropertyOptional({
    description: 'IDs de cursos',
    type: [Number],
    example: [1],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  courseIds?: number[];

  @ApiPropertyOptional({
    description: 'IDs de materias',
    type: [Number],
    example: [1],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
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
  @IsString({ each: true })
  mimetypes?: string[];

  @ApiPropertyOptional({
    description: 'Solo documentos públicos',
    example: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir eliminados',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    description: 'Buscar también en el contenido de los documentos',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeContent?: boolean = false;

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
  @IsIn(['relevance', 'createdAt', 'updatedAt', 'filename', 'size'])
  sortBy?: string = 'relevance';

  @ApiPropertyOptional({
    description: 'Dirección de ordenamiento',
    example: 'desc',
    default: 'desc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
