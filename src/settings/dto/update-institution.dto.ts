import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInstitutionDto {
  @ApiPropertyOptional({
    example: 'Colegio San José',
    description: 'Nombre de la institución',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    example: 'Av. Principal 123, Ciudad',
    description: 'Dirección física',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    example: '+52 55 1234 5678',
    description: 'Teléfono de contacto',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    example: 'contacto@colegio.edu',
    description: 'Email institucional',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'https://www.colegio.edu',
    description: 'Sitio web',
  })
  @IsUrl()
  @IsOptional()
  website?: string;
}
