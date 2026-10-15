import { ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction, AuditResource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query contract for the future audit log endpoints (for example, per document). */
export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Número de página', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Elementos por página',
    example: 20,
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Acción auditada', enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Tipo de recurso auditado', enum: AuditResource })
  @IsOptional()
  @IsEnum(AuditResource)
  resource?: AuditResource;

  @ApiPropertyOptional({ description: 'Identificador del recurso auditado' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Identificador del documento relacionado', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  documentId?: number;

  @ApiPropertyOptional({ description: 'Identificador del actor' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Identificador de la solicitud' })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({
    description: 'Fecha inicial (ISO 8601)',
    example: '2026-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    description: 'Fecha final (ISO 8601)',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
