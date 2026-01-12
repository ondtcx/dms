import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class BatchExportDto {
  @ApiProperty({ description: 'IDs de los documentos a exportar', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  documentIds: number[];
}
