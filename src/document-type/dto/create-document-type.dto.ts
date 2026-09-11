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
    description: 'Nombre del subtipo de documento',
    example: 'Oficio Interno',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del subtipo',
    example: 'Comunicación oficial interna entre departamentos',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'ID de la categoría a la que pertenece este subtipo',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  @IsNotEmpty()
  categoryId: number;

  @ApiPropertyOptional({
    description: 'Si el subtipo está activo',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Si este subtipo es el tipo de documento predeterminado global',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
