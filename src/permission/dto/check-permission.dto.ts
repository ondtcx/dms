import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CheckPermissionDto {
  @ApiProperty({
    description: 'Nombre del permiso a verificar',
    example: 'documents.create',
  })
  @IsString()
  @Length(3, 100)
  permissionName: string;
}
