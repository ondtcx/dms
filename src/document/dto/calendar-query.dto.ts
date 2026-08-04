import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CalendarQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha de inicio del rango',
    example: '2026-01-01',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin del rango',
    example: '2026-12-31',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de categoría',
    example: 2,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;
}
