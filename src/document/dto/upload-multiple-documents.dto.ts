import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { UploadDocumentDto } from './upload-document.dto';

export class UploadFileMetadataDto extends OmitType(UploadDocumentDto, [
  'directoryId',
] as const) {}

export class UploadMultipleDocumentsDto {
  @ApiPropertyOptional({ description: 'Directorio común de destino' })
  @Transform(({ value }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @IsOptional()
  directoryId?: number;

  @ApiProperty({
    description: 'Array JSON de metadatos en el mismo orden que los archivos',
  })
  @Transform(
    ({ value }) => {
      let items = value;
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch {
          throw new BadRequestException(
            'Los metadatos deben ser un arreglo JSON válido',
          );
        }
      }
      if (!Array.isArray(items))
        throw new BadRequestException(
          'Los metadatos deben ser un arreglo JSON válido',
        );
      return items.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          throw new BadRequestException(
            'Cada archivo requiere un objeto de metadatos',
          );
        return plainToInstance(UploadFileMetadataDto, item);
      });
    },
    { toClassOnly: true },
  )
  @Type(() => UploadFileMetadataDto)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  metadata: UploadFileMetadataDto[];
}
