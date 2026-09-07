import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartWorkflowDto {
  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  versionId?: number;

  @ApiPropertyOptional({ example: 'Documento listo para revisión' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}
