// src/documents/dto/query-documents.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryDocumentDto {
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
    description: 'Filtrar por ID de sección',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sectionId?: number;

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
}
