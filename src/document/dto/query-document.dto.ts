// src/documents/dto/query-documents.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, IsIn, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export const DOCUMENT_LIST_VIEWS = [
  'recent-accessed',
  'recent-created',
  'all',
  'trash',
] as const;

export type DocumentListView = (typeof DOCUMENT_LIST_VIEWS)[number];

export class QueryDocumentDto {
  @ApiPropertyOptional({ enum: DOCUMENT_LIST_VIEWS, description: 'Vista documental solicitada' })
  @IsIn(DOCUMENT_LIST_VIEWS)
  @IsOptional()
  view?: DocumentListView;

  @ApiPropertyOptional({ description: 'ID del directorio lógico; omitir equivale a no filtrar', example: 4 })
  @IsInt()
  @IsOptional()
  @Transform(({ value }) => (
    value === 'null' || value === null
      ? null
      : (value === undefined || value === '' ? undefined : parseInt(value, 10))
  ))
  directoryId?: number | null;
  @ApiPropertyOptional({
    description: 'Buscar por nombre de archivo',
    example: 'contrato',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de categoría',
    example: 2,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de subtipo de documento (DocumentType)',
    example: 3,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  documentTypeId?: number;

  @ApiPropertyOptional({
    description: 'Solo documentos públicos',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Incluir documentos eliminados (papelera)',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  includeDeleted?: boolean;

  @ApiPropertyOptional({
    description: 'Solo documentos subidos por el usuario actual',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  onlyMine?: boolean;

  @ApiPropertyOptional({
    description: 'Página',
    example: 1,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    example: 10,
    default: 10,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Excluir documentos que pertenecen a un lote',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  excludeBatched?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar documentos de un lote específico',
    example: 'clx1234abc',
  })
  @IsString()
  @IsOptional()
  batchId?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar por año lectivo. Los documentos sin año (permanentes) siempre se incluyen.',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  academicYearId?: number;

  @ApiPropertyOptional({
    description: 'Excluir documentos compuestos del resultado',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  excludeComposites?: boolean;
}
