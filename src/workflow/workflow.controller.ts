import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireAnyPermission, RequirePermission } from '../auth/decorators/permission.decorator';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { CreateWorkflowVersionDto } from './dto/create-workflow-version.dto';
import { ReassignWorkflowAssignmentDto } from './dto/reassign-workflow-assignment.dto';
import { StartWorkflowDto } from './dto/start-workflow.dto';
import { WorkflowTransitionDto } from './dto/workflow-transition.dto';
import { WorkflowService } from './workflow.service';
import { WorkflowFeatureGuard } from './workflow-feature.guard';

@ApiTags('workflows')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(WorkflowFeatureGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('workflow-definitions')
  @RequirePermission('workflow.templates.manage')
  findDefinitions() { return this.workflowService.findDefinitions(); }

  @Get('documents/:id/workflow-definitions')
  @RequirePermission('workflow.start')
  findApplicableDefinitions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.workflowService.findApplicableDefinitions(id, user.id, user.role);
  }

  @Post('workflow-definitions')
  @RequirePermission('workflow.templates.manage')
  createDefinition(@Body() dto: CreateWorkflowDefinitionDto, @CurrentUser() user: any) {
    return this.workflowService.createDefinition(dto, user.id);
  }

  @Post('workflow-definitions/:id/versions')
  @RequirePermission('workflow.templates.manage')
  createVersion(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateWorkflowVersionDto) {
    return this.workflowService.createVersion(id, dto);
  }

  @Post('workflow-definitions/:id/activate')
  @RequirePermission('workflow.templates.manage')
  activate(@Param('id', ParseIntPipe) id: number) { return this.workflowService.activate(id); }

  @Post('documents/:id/workflows')
  @RequirePermission('workflow.start')
  start(@Param('id', ParseIntPipe) id: number, @Body() dto: StartWorkflowDto, @CurrentUser() user: any) {
    return this.workflowService.start(id, dto, user.id, user.role);
  }

  @Get('documents/:id/workflows')
  @RequirePermission('workflow.view')
  history(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.workflowService.history(id, user.id, user.role);
  }

  @Post('workflows/:id/transitions')
  @RequireAnyPermission('workflow.submit', 'workflow.approve', 'workflow.request_changes', 'workflow.reject', 'workflow.cancel')
  transition(@Param('id', ParseIntPipe) id: number, @Body() dto: WorkflowTransitionDto, @CurrentUser() user: any) {
    return this.workflowService.transition(id, dto, user.id, user.role);
  }

  @Post('workflows/:id/assignments/:assignmentId/reassign')
  @RequirePermission('workflow.assignments.manage')
  reassign(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() dto: ReassignWorkflowAssignmentDto,
    @CurrentUser() user: any,
  ) { return this.workflowService.reassign(id, assignmentId, dto, user.id, user.role); }
}
