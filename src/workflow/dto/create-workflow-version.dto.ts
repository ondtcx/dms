import { PartialType } from '@nestjs/swagger';
import { CreateWorkflowDefinitionDto } from './create-workflow-definition.dto';

export class CreateWorkflowVersionDto extends PartialType(CreateWorkflowDefinitionDto) {}
