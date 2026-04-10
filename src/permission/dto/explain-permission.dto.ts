import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ExplainPermissionDto {
  @ApiProperty({ description: 'ID del documento a evaluar', example: 1 })
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  documentId: number;

  @ApiProperty({
    description: 'ID del usuario del que se quieren explicar los permisos',
    example: 'cuid-1234-5678',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
