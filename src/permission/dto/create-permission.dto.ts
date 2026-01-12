import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Length } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Nombre único del permiso',
    example: 'documents.create',
  })
  @IsString()
  @Length(3, 100)
  name: string;

  @ApiProperty({
    description: 'Recurso al que aplica el permiso',
    example: 'documents',
  })
  @IsString()
  @Length(2, 50)
  resource: string;

  @ApiProperty({
    description: 'Acción permitida',
    example: 'create',
  })
  @IsString()
  @Length(2, 50)
  action: string;

  @ApiPropertyOptional({
    description: 'Descripción del permiso',
    example: 'Permite crear nuevos documentos',
  })
  @IsString()
  @IsOptional()
  description?: string;
}
