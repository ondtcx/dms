import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, Matches } from 'class-validator';

export class CreateSectionDto {
  @ApiProperty({
    description: 'Nombre de la sección',
    example: 'Académico',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción de la sección',
    example: 'Documentos relacionados con actividades académicas',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Color hexadecimal para identificación visual',
    example: '#10b981',
    default: '#10b981',
  })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({
    description: 'Nombre del icono de lucide-react',
    example: 'BookOpen',
    default: 'FolderOpen',
  })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Si la sección está activa',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Prefijo para numeración de documentos (máx. 6 chars, mayúsculas y números). Si no se indica, se deriva automáticamente del nombre.',
    example: 'GA',
  })
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,6}$/, { message: 'El prefijo debe tener entre 1 y 6 caracteres en mayúsculas o números' })
  prefix?: string;
}
