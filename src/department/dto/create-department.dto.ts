import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  Length,
  Matches,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({
    description: 'Nombre del departamento',
    example: 'Dirección Académica',
  })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    description: 'Código único del departamento',
    example: 'ACA',
  })
  @IsString()
  @Length(2, 20)
  @Matches(/^[A-Z0-9-]+$/, {
    message:
      'El código debe contener solo letras mayúsculas, números y guiones',
  })
  code: string;

  @ApiPropertyOptional({
    description: 'Descripción del departamento',
    example: 'Departamento encargado de la gestión académica',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Color hexadecimal para identificación visual',
    example: '#3b82f6',
    default: '#3b82f6',
  })
  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'El color debe ser un valor hexadecimal válido (ej: #3b82f6)',
  })
  color?: string;

  @ApiPropertyOptional({
    description: 'Nombre del icono de lucide-react',
    example: 'Building',
    default: 'Building',
  })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Si el departamento está activo',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
