import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class MyInitiatedQueryDto {
  @ApiProperty({
    description: 'Filtrar por estado del workflow',
    enum: ['all', 'active', 'completed', 'cancelled'],
    default: 'all',
    required: false,
  })
  @IsOptional()
  @IsIn(['all', 'active', 'completed', 'cancelled'])
  status?: 'all' | 'active' | 'completed' | 'cancelled';

  @ApiProperty({ description: 'Número de página', default: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Resultados por página',
    default: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
