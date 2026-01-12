import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateCommentDto {
  @ApiProperty({
    description: 'Nuevo contenido del comentario',
    example: 'Contenido actualizado',
  })
  @IsString()
  content: string;
}
