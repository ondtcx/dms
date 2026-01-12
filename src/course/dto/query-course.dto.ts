import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EducationalLevel } from '../educational-level.enum';

export class QueryCourseDto {
  @ApiPropertyOptional({
    description: 'Buscar por nombre o código',
    example: 'primero',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por nivel educativo',
    enum: EducationalLevel,
    example: EducationalLevel.PRIMARIA,
  })
  @IsEnum(EducationalLevel)
  @IsOptional()
  level?: EducationalLevel;

  @ApiPropertyOptional({
    description: 'Filtrar por departamento',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por año académico',
    example: '2024-2025',
  })
  @IsString()
  @IsOptional()
  academicYear?: string;

  @ApiPropertyOptional({
    description: 'Filtrar solo cursos activos',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

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
}
