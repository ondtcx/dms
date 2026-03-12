import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, ValidateIf } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ description: 'ID del documento a transferir', example: 1 })
  @IsInt()
  documentId: number;

  @ApiPropertyOptional({
    description:
      'ID del usuario destinatario (requerido si no se proporciona toDepartmentId)',
    example: 'clxyz123',
  })
  @ValidateIf((o) => !o.toDepartmentId)
  @IsString()
  @IsOptional()
  toUserId?: string;

  @ApiPropertyOptional({
    description:
      'ID del departamento destinatario (requerido si no se proporciona toUserId)',
  })
  @ValidateIf((o) => !o.toUserId)
  @IsInt()
  @IsOptional()
  toDepartmentId?: number;

  @ApiPropertyOptional({
    description: 'Comentario o razón de la transferencia',
  })
  @IsOptional()
  @IsString()
  comment?: string;
}
