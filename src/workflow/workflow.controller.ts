import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowTemplateDto } from './dto/create-workflow-template.dto';
import { UpdateWorkflowTemplateDto } from './dto/update-workflow-template.dto';
import { InitiateWorkflowDto } from './dto/initiate-workflow.dto';
import { ApproveWorkflowDto } from './dto/approve-workflow.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('workflows')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // ============ Gestión de Templates ============

  @Post('templates')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Crear una plantilla de workflow' })
  @ApiResponse({ status: 201, description: 'Plantilla creada exitosamente' })
  @ApiResponse({ status: 409, description: 'Ya existe una plantilla con ese nombre' })
  createTemplate(@Body() createDto: CreateWorkflowTemplateDto) {
    return this.workflowService.createTemplate(createDto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Listar todas las plantillas de workflow' })
  @ApiResponse({ status: 200, description: 'Lista de plantillas' })
  findAllTemplates() {
    return this.workflowService.findAllTemplates();
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Obtener una plantilla por ID' })
  @ApiResponse({ status: 200, description: 'Plantilla encontrada' })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  findOneTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.workflowService.findOneTemplate(id);
  }

  @Patch('templates/:id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR)
  @ApiOperation({ summary: 'Actualizar una plantilla de workflow' })
  @ApiResponse({ status: 200, description: 'Plantilla actualizada' })
  @ApiResponse({ status: 404, description: 'Plantilla no encontrada' })
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateWorkflowTemplateDto,
  ) {
    return this.workflowService.updateTemplate(id, updateDto);
  }

  @Delete('templates/:id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Eliminar una plantilla de workflow' })
  @ApiResponse({ status: 200, description: 'Plantilla eliminada' })
  @ApiResponse({ status: 400, description: 'Hay workflows activos usando esta plantilla' })
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.workflowService.deleteTemplate(id);
  }

  // ============ Gestión de Workflows ============

  @Post('documents/:documentId/initiate')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.COORDINADOR, UserRole.PROFESOR, UserRole.SECRETARIO)
  @ApiOperation({ summary: 'Iniciar un workflow para un documento' })
  @ApiResponse({ status: 201, description: 'Workflow iniciado exitosamente' })
  @ApiResponse({ status: 404, description: 'Documento o plantilla no encontrada' })
  @ApiResponse({ status: 409, description: 'El documento ya tiene un workflow activo' })
  initiateWorkflow(
    @Param('documentId', ParseIntPipe) documentId: number,
    @Request() req,
    @Body() initiateDto: InitiateWorkflowDto,
  ) {
    return this.workflowService.initiateWorkflow(
      documentId,
      req.user.id,
      initiateDto,
    );
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: 'Obtener el workflow de un documento' })
  @ApiResponse({ status: 200, description: 'Workflow encontrado' })
  @ApiResponse({ status: 404, description: 'No se encontró workflow para este documento' })
  getWorkflowByDocument(@Param('documentId', ParseIntPipe) documentId: number) {
    return this.workflowService.getWorkflowByDocument(documentId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Obtener workflows pendientes de aprobación para el usuario actual' })
  @ApiResponse({ status: 200, description: 'Lista de workflows pendientes' })
  getPendingWorkflows(@Request() req) {
    return this.workflowService.getPendingWorkflows(req.user.id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Aprobar/rechazar un workflow' })
  @ApiResponse({ status: 200, description: 'Acción procesada exitosamente' })
  @ApiResponse({ status: 403, description: 'No tiene permisos para aprobar en este estado' })
  @ApiResponse({ status: 404, description: 'Workflow no encontrado' })
  processApproval(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() approveDto: ApproveWorkflowDto,
  ) {
    return this.workflowService.processApproval(id, req.user.id, approveDto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar un workflow' })
  @ApiResponse({ status: 200, description: 'Workflow cancelado' })
  @ApiResponse({ status: 403, description: 'No tiene permisos para cancelar este workflow' })
  @ApiResponse({ status: 404, description: 'Workflow no encontrado' })
  cancelWorkflow(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.workflowService.cancelWorkflow(id, req.user.id);
  }
}
