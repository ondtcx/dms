import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSchoolYearDto {
  @ApiPropertyOptional({ example: '2025-2026', description: 'Nombre del ciclo escolar' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '2025-09-01', description: 'Fecha de inicio (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Fecha de fin (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Si el ciclo escolar está activo' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
