import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ThemeOption {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export class UpdateAppearanceDto {
  @ApiPropertyOptional({ example: '#3b82f6', description: 'Color primario (hex)' })
  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor debe ser un color hexadecimal válido (#rrggbb)' })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#10b981', description: 'Color secundario (hex)' })
  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'secondaryColor debe ser un color hexadecimal válido (#rrggbb)' })
  secondaryColor?: string;

  @ApiPropertyOptional({ enum: ThemeOption, description: 'Tema de la interfaz' })
  @IsEnum(ThemeOption)
  @IsOptional()
  theme?: ThemeOption;
}
