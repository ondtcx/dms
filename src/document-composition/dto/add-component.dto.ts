import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddComponentDto {
  @ApiProperty({
    example: 5,
    description: 'ID del documento a incluir como componente',
  })
  @IsInt()
  @Type(() => Number)
  childId: number;

  @ApiPropertyOptional({ example: 'Acta Reunión 15/03' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Insertar después de la página N del bloque anterior (null = al final)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  insertAfterPage?: number;
}
