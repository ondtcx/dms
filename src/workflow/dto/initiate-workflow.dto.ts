import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class InitiateWorkflowDto {
  @ApiProperty({
    description: 'ID de la plantilla de workflow a usar',
    example: 1,
  })
  @IsInt()
  templateId: number;
}
