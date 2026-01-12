import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowTemplateDto } from './dto/create-workflow-template.dto';
import { UpdateWorkflowTemplateDto } from './dto/update-workflow-template.dto';
import { InitiateWorkflowDto } from './dto/initiate-workflow.dto';
import { ApproveWorkflowDto } from './dto/approve-workflow.dto';
import { WorkflowStatus } from './workflow-status.enum';
import { ApprovalAction } from './approval-action.enum';
import { UserRole } from '../auth/role.enum';

interface StateDefinition {
  state: string;
  role: string;
  order: number;
  requiresComment?: boolean;
}

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService) {}

  // ============ CRUD de Workflow Templates ============

  async createTemplate(createDto: CreateWorkflowTemplateDto) {
    // Verificar que el nombre sea único
    const existing = await this.prisma.workflowTemplate.findUnique({
      where: { name: createDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una plantilla de workflow con el nombre "${createDto.name}"`,
      );
    }

    // Verificar que la categoría existe si se proporciona
    if (createDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: createDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Categoría con ID ${createDto.categoryId} no encontrada`,
        );
      }
    }

    // Validar stateDefinitions
    this.validateStateDefinitions(createDto.stateDefinitions);

    return this.prisma.workflowTemplate.create({
      data: {
        ...createDto,
        stateDefinitions: createDto.stateDefinitions as any,
      },
      include: {
        category: true,
      },
    });
  }

  async findAllTemplates() {
    return this.prisma.workflowTemplate.findMany({
      include: {
        category: true,
        _count: {
          select: {
            workflows: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneTemplate(id: number) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id },
      include: {
        category: true,
        _count: {
          select: {
            workflows: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException(
        `Plantilla de workflow con ID ${id} no encontrada`,
      );
    }

    return template;
  }

  async updateTemplate(id: number, updateDto: UpdateWorkflowTemplateDto) {
    await this.findOneTemplate(id);

    // Verificar nombre único si se actualiza
    if (updateDto.name) {
      const existing = await this.prisma.workflowTemplate.findFirst({
        where: {
          name: updateDto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe otra plantilla con el nombre "${updateDto.name}"`,
        );
      }
    }

    // Validar stateDefinitions si se actualizan
    if (updateDto.stateDefinitions) {
      this.validateStateDefinitions(updateDto.stateDefinitions);
    }

    // Verificar categoría si se actualiza
    if (updateDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: updateDto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(
          `Categoría con ID ${updateDto.categoryId} no encontrada`,
        );
      }
    }

    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...updateDto,
        stateDefinitions: updateDto.stateDefinitions as any,
      },
      include: {
        category: true,
      },
    });
  }

  async deleteTemplate(id: number) {
    const template = await this.findOneTemplate(id);

    // Verificar si hay workflows activos usando esta plantilla
    const activeWorkflows = await this.prisma.documentWorkflow.count({
      where: {
        templateId: id,
        status: {
          in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS],
        },
      },
    });

    if (activeWorkflows > 0) {
      throw new BadRequestException(
        `No se puede eliminar la plantilla porque tiene ${activeWorkflows} workflow(s) activo(s)`,
      );
    }

    await this.prisma.workflowTemplate.delete({
      where: { id },
    });

    return {
      message: `Plantilla de workflow "${template.name}" eliminada exitosamente`,
    };
  }

  // ============ Gestión de Workflows ============

  async initiateWorkflow(
    documentId: number,
    userId: string,
    initiateDto: InitiateWorkflowDto,
  ) {
    // Verificar que el documento existe
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado`,
      );
    }

    // Verificar que no haya un workflow activo para este documento
    const existingWorkflow = await this.prisma.documentWorkflow.findUnique({
      where: { documentId },
    });

    if (existingWorkflow) {
      throw new ConflictException(
        `El documento ya tiene un workflow ${existingWorkflow.status}`,
      );
    }

    // Verificar que la plantilla existe y está activa
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: initiateDto.templateId },
    });

    if (!template) {
      throw new NotFoundException(
        `Plantilla de workflow con ID ${initiateDto.templateId} no encontrada`,
      );
    }

    if (!template.isActive) {
      throw new BadRequestException(
        `La plantilla de workflow "${template.name}" está inactiva`,
      );
    }

    // Obtener el primer estado del workflow
    const stateDefinitions = template.stateDefinitions as unknown as StateDefinition[];
    const firstState = stateDefinitions.sort((a, b) => a.order - b.order)[0];

    if (!firstState) {
      throw new BadRequestException(
        'La plantilla de workflow no tiene estados definidos',
      );
    }

    // Crear el workflow
    const workflow = await this.prisma.documentWorkflow.create({
      data: {
        documentId,
        templateId: template.id,
        status: WorkflowStatus.IN_PROGRESS,
        currentState: firstState.state,
        currentStateOrder: firstState.order,
        initiatedById: userId,
      },
      include: {
        template: true,
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
        initiatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return workflow;
  }

  async getWorkflowByDocument(documentId: number) {
    const workflow = await this.prisma.documentWorkflow.findUnique({
      where: { documentId },
      include: {
        template: true,
        document: {
          select: {
            id: true,
            filename: true,
            description: true,
          },
        },
        initiatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        approvals: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        `No se encontró un workflow para el documento con ID ${documentId}`,
      );
    }

    return workflow;
  }

  async getPendingWorkflows(userId: string) {
    // Obtener usuario con su rol
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    // Buscar workflows donde el estado actual requiere el rol del usuario
    const allWorkflows = await this.prisma.documentWorkflow.findMany({
      where: {
        status: WorkflowStatus.IN_PROGRESS,
      },
      include: {
        template: true,
        document: {
          select: {
            id: true,
            filename: true,
            description: true,
          },
        },
        initiatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Filtrar por workflows donde el usuario puede aprobar
    const pendingWorkflows = allWorkflows.filter((workflow) => {
      const stateDefinitions = workflow.template
        .stateDefinitions as unknown as StateDefinition[];
      const currentState = stateDefinitions.find(
        (s) => s.state === workflow.currentState,
      );

      return currentState && currentState.role === user.role;
    });

    return pendingWorkflows;
  }

  async processApproval(
    workflowId: number,
    userId: string,
    approveDto: ApproveWorkflowDto,
  ) {
    // Obtener el workflow con toda su información
    const workflow = await this.prisma.documentWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        template: true,
        document: true,
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow con ID ${workflowId} no encontrado`,
      );
    }

    // Verificar que el workflow esté en progreso
    if (workflow.status !== WorkflowStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `El workflow está en estado ${workflow.status} y no puede ser modificado`,
      );
    }

    // Obtener usuario
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    // Verificar que el usuario tiene el rol requerido para el estado actual
    const stateDefinitions = workflow.template
      .stateDefinitions as unknown as StateDefinition[];
    const currentState = stateDefinitions.find(
      (s) => s.state === workflow.currentState,
    );

    if (!currentState) {
      throw new BadRequestException(
        `Estado actual "${workflow.currentState}" no encontrado en la plantilla`,
      );
    }

    if (currentState.role !== user.role && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        `Solo usuarios con rol ${currentState.role} pueden aprobar en este estado`,
      );
    }

    // Verificar si se requiere comentario
    const requiresComment =
      workflow.template.requiresComment || currentState.requiresComment;
    if (
      requiresComment &&
      !approveDto.comment &&
      approveDto.action !== ApprovalAction.COMMENTED
    ) {
      throw new BadRequestException(
        'Este estado requiere un comentario obligatorio',
      );
    }

    // Crear el registro de aprobación
    await this.prisma.workflowApproval.create({
      data: {
        workflowId,
        state: workflow.currentState,
        stateOrder: workflow.currentStateOrder,
        action: approveDto.action,
        userId,
        comment: approveDto.comment,
      },
    });

    // Procesar la acción
    if (approveDto.action === ApprovalAction.REJECTED) {
      // Rechazar el workflow
      await this.prisma.documentWorkflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.REJECTED,
          completedAt: new Date(),
        },
      });

      return {
        status: WorkflowStatus.REJECTED,
        message: 'Workflow rechazado',
      };
    } else if (approveDto.action === ApprovalAction.APPROVED) {
      // Avanzar al siguiente estado o completar
      return this.advanceWorkflow(workflowId, stateDefinitions);
    } else if (approveDto.action === ApprovalAction.REQUESTED_CHANGES) {
      // Mantener en el mismo estado pero registrado
      return {
        status: WorkflowStatus.IN_PROGRESS,
        message: 'Se han solicitado cambios',
      };
    } else if (approveDto.action === ApprovalAction.COMMENTED) {
      // Solo comentar, sin cambios
      return {
        status: WorkflowStatus.IN_PROGRESS,
        message: 'Comentario agregado',
      };
    }
  }

  async cancelWorkflow(workflowId: number, userId: string) {
    const workflow = await this.prisma.documentWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow con ID ${workflowId} no encontrado`,
      );
    }

    // Verificar que el usuario sea el iniciador o admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (
      workflow.initiatedById !== userId &&
      user?.role !== UserRole.ADMIN &&
      user?.role !== UserRole.DIRECTOR
    ) {
      throw new ForbiddenException(
        'Solo el iniciador o un administrador pueden cancelar el workflow',
      );
    }

    await this.prisma.documentWorkflow.update({
      where: { id: workflowId },
      data: {
        status: WorkflowStatus.CANCELLED,
        completedAt: new Date(),
      },
    });

    return {
      message: 'Workflow cancelado exitosamente',
    };
  }

  // ============ Métodos Auxiliares ============

  private validateStateDefinitions(states: StateDefinition[]) {
    if (!states || states.length === 0) {
      throw new BadRequestException(
        'Debe definir al menos un estado en el workflow',
      );
    }

    // Verificar que los órdenes sean consecutivos y únicos
    const orders = states.map((s) => s.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i) {
        throw new BadRequestException(
          'Los órdenes de los estados deben ser consecutivos empezando desde 0',
        );
      }
    }

    // Verificar que los nombres de estados sean únicos
    const stateNames = states.map((s) => s.state);
    const uniqueNames = new Set(stateNames);
    if (uniqueNames.size !== stateNames.length) {
      throw new BadRequestException(
        'Los nombres de los estados deben ser únicos',
      );
    }
  }

  private async advanceWorkflow(
    workflowId: number,
    stateDefinitions: StateDefinition[],
  ) {
    const workflow = await this.prisma.documentWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow no encontrado');
    }

    // Buscar el siguiente estado
    const sortedStates = stateDefinitions.sort((a, b) => a.order - b.order);
    const nextStateIndex =
      sortedStates.findIndex(
        (s) => s.order === workflow.currentStateOrder,
      ) + 1;

    if (nextStateIndex >= sortedStates.length) {
      // No hay más estados, aprobar el workflow
      await this.prisma.documentWorkflow.update({
        where: { id: workflowId },
        data: {
          status: WorkflowStatus.APPROVED,
          completedAt: new Date(),
        },
      });

      return {
        status: WorkflowStatus.APPROVED,
        message: 'Workflow completado y aprobado',
      };
    } else {
      // Avanzar al siguiente estado
      const nextState = sortedStates[nextStateIndex];
      await this.prisma.documentWorkflow.update({
        where: { id: workflowId },
        data: {
          currentState: nextState.state,
          currentStateOrder: nextState.order,
        },
      });

      return {
        status: WorkflowStatus.IN_PROGRESS,
        currentState: nextState.state,
        message: `Workflow avanzado al estado "${nextState.state}"`,
      };
    }
  }
}
