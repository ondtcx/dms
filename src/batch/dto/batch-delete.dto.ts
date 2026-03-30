import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional } from 'class-validator';

export class BatchDeleteDto {
  @ApiProperty({
    description: 'IDs de los documentos a eliminar',
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  documentIds: number[];

  @ApiPropertyOptional({
    description: 'Eliminar permanentemente (true) o soft delete (false)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;
}
