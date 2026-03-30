import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AccessShareDto {
  @ApiPropertyOptional({
    description: 'Contraseña del share (si está protegido)',
  })
  @IsOptional()
  @IsString()
  password?: string;
}
