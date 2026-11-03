import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ description: 'ID del documento a transferir', example: 1 })
  @IsInt()
  @Min(1)
  documentId: number;

  @ApiProperty({
    description: 'ID del usuario destinatario',
    example: 'clxyz123',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  toUserId: string;

  @ApiPropertyOptional({
    description: 'Motivo o comentario de la transferencia',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
