import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateResetTokenDto {
  @ApiProperty({
    description: 'ID del usuario para el cual generar el token de restablecimiento',
    example: 'clxx1234567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
