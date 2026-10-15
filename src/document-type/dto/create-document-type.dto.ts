import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsPositive,
} from 'class-validator';

export class CreateDocumentTypeDto {
  @ApiProperty({
    description: 'Nombre del tipo de documento',
    example: 'Oficio Interno',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del tipo',
    example: 'Comunicación oficial interna entre departamentos',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'ID opcional de la categoría a la que pertenece este tipo',
    example: 1,
    nullable: true,
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  categoryId?: number | null;

  @ApiPropertyOptional({
    description: 'Si el tipo está activo',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Si este tipo es el tipo de documento predeterminado global',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
