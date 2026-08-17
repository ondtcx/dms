import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class SaveContentDto {
  @ApiProperty({
    description: 'Contenido de texto del documento',
    example: 'Contenido del documento...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000_000)
  content: string;
}
