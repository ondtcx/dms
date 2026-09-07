import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReassignWorkflowAssignmentDto {
  @ApiProperty({ example: 'user-id' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: 'Cambio de responsable por ausencia' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
