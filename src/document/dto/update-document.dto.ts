// src/documents/dto/update-document.dto.ts
import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { DocumentMetadataDto } from './upload-document.dto';

export class UpdateDocumentDto extends PartialType(
  OmitType(DocumentMetadataDto, ['search'] as const),
) {
  @ApiPropertyOptional({
    description: 'Nombre visible del documento, independiente del archivo original',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'El nombre del documento debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del documento no puede estar vacío' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Número institucional; null o vacío elimina el número',
    nullable: true,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString({ message: 'El número institucional debe ser texto' })
  documentNumber?: string | null;
}
