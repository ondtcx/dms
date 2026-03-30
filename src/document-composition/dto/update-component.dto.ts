import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateComponentDto {
  @ApiPropertyOptional({ example: 'Acta Reunión 15/03' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'null = al final del bloque anterior',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  insertAfterPage?: number | null;
}
