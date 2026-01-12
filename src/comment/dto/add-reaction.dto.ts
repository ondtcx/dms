import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class AddReactionDto {
  @ApiProperty({
    description: 'Emoji de reacción',
    example: '👍',
  })
  @IsString()
  @Matches(/^[\p{Emoji}]+$/u, {
    message: 'Debe ser un emoji válido',
  })
  emoji: string;
}
