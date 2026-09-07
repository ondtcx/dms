import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkflowTransitionAction } from '@prisma/client';

export class WorkflowTransitionDto {
  @ApiProperty({ enum: WorkflowTransitionAction })
  @IsEnum(WorkflowTransitionAction)
  action: WorkflowTransitionAction;

  @ApiPropertyOptional({ example: 'Falta adjuntar el acta firmada' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsInt()
  @IsOptional()
  versionId?: number;
}
