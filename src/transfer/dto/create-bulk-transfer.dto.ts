import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_BATCH_DOCUMENTS = 500;

export class CreateBulkTransferDto {
  @ApiProperty({
    description: 'Documentos propios que se incluirán en el lote',
    type: [Number],
    maxItems: MAX_BATCH_DOCUMENTS,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH_DOCUMENTS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  documentIds: number[];

  @ApiProperty({ description: 'ID del usuario destinatario' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  toUserId: string;

  @ApiPropertyOptional({
    description: 'Motivo o comentario del lote',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class CreateBulkAdminTransferDto {
  @ApiProperty({ description: 'ID del propietario saliente' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fromOwnerId: string;

  @ApiPropertyOptional({
    description:
      'Documentos concretos del propietario; si se omite, se incluyen todos',
    type: [Number],
    maxItems: MAX_BATCH_DOCUMENTS,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BATCH_DOCUMENTS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  documentIds?: number[];

  @ApiProperty({ description: 'ID del usuario destinatario' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  toUserId: string;

  @ApiPropertyOptional({
    description: 'Motivo o comentario del lote',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
