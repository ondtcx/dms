import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';
import { EducationalLevel } from '../educational-level.enum';

export class CreateCourseDto {
  @ApiProperty({
    description: 'Nombre del curso',
    example: '1° Grado A',
  })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    description: 'Código único del curso',
    example: '1A-2024',
  })
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Z0-9-]+$/, {
    message:
      'El código debe contener solo letras mayúsculas, números y guiones',
  })
  code: string;

  @ApiProperty({
    description: 'Nivel educativo del curso',
    enum: EducationalLevel,
    example: EducationalLevel.PRIMARIA,
  })
  @IsEnum(EducationalLevel)
  level: EducationalLevel;

  @ApiPropertyOptional({
    description: 'ID del departamento al que pertenece',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  departmentId?: number;

  @ApiProperty({
    description: 'Año académico',
    example: '2024-2025',
  })
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'El año académico debe tener el formato YYYY-YYYY (ej: 2024-2025)',
  })
  academicYear: string;

  @ApiPropertyOptional({
    description: 'Si el curso está activo',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
