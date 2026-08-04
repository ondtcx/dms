import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Nombre de la categoría',
    example: 'Legales',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción de la categoría',
    example: 'Documentos relacionados con asuntos legales y jurídicos',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Color hexadecimal para el badge',
    example: '#3b82f6',
    default: '#3b82f6',
  })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({
    description: 'Nombre del icono de lucide-react',
    example: 'Scale',
    default: 'Folder',
  })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Si la categoría está activa',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Si esta categoría requiere especificar un curso al subir documentos',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  requiresCourse?: boolean;

  @ApiPropertyOptional({
    description:
      'Roles que pueden subir documentos a esta categoría (vacío = sin restricción)',
    example: ['profesor', 'coordinador'],
    default: [],
  })
  @IsArray()
  @IsOptional()
  allowedRoles?: string[];

  @ApiPropertyOptional({
    description:
      'Prefijo para numeración de documentos (máx. 6 chars, mayúsculas y números). Si no se indica, se deriva automáticamente del nombre.',
    example: 'PLN',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,6}$/, {
    message:
      'El prefijo debe tener entre 1 y 6 caracteres en mayúsculas o números',
  })
  prefix?: string;
}
