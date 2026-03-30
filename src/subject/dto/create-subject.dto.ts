import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({
    description: 'Nombre de la materia',
    example: 'Matemáticas',
  })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    description: 'Código único de la materia',
    example: 'MAT',
  })
  @IsString()
  @Length(2, 20)
  @Matches(/^[A-Z0-9-]+$/, {
    message:
      'El código debe contener solo letras mayúsculas, números y guiones',
  })
  code: string;

  @ApiPropertyOptional({
    description: 'Descripción de la materia',
    example: 'Materia de ciencias exactas',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'ID del curso al que pertenece',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  courseId?: number;

  @ApiPropertyOptional({
    description: 'Si la materia está activa',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
