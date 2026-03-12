import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateTransferStatusDto {
  @ApiPropertyOptional({
    description: 'Comentario al aceptar o cancelar la transferencia',
  })
  @IsOptional()
  @IsString()
  comment?: string;
}
