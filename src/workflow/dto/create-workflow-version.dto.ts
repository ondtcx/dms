import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { CreateWorkflowDefinitionDto } from './create-workflow-definition.dto';

export class CreateWorkflowVersionDto extends PartialType(CreateWorkflowDefinitionDto) {
  @ApiPropertyOptional({ description: 'Versión base utilizada para editar una nueva versión' })
  @IsInt()
  @Min(1)
  @IsOptional()
  baseVersionId?: number;
}
