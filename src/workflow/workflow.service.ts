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
import { MyInitiatedQueryDto } from './dto/my-initiated-query.dto';
import { WorkflowStatus } from './workflow-status.enum';
import { ApprovalAction } from './approval-action.enum';
import { UserRole } from '../auth/role.enum';
import { UserRole as PrismaUserRole } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';

interface StateDefinition {
  state: string;
  role: string;
  order: number;
  requiresComment?: boolean;
}

@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

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
    // Verificar que el documento existe y el usuario tiene acceso (ReBAC)
    const userForAccess = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });
    const accessFilter = userForAccess
      ? buildDocumentAccessFilter({ ...userForAccess, role: userForAccess.role as unknown as UserRole })
      : null;

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null, ...(accessFilter ?? {}) },
      select: {
        id: true,
        filename: true,
        uploadedBy: { select: { departmentId: true } },
        course: { select: { departmentId: true } },
      },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado o sin acceso`,
      );
    }

    const documentDeptId =
      (document.course as any)?.departmentId ??
      (document.uploadedBy as any)?.departmentId ??
      null;

    // Verificar que no haya un workflow activo para este documento
    const existingWorkflow = await this.prisma.documentWorkflow.findUnique({
      where: { documentId },
    });

    if (existingWorkflow) {
      const activeStatuses = [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS];
      if (activeStatuses.includes(existingWorkflow.status as WorkflowStatus)) {
        throw new ConflictException(
          `El documento ya tiene un workflow activo en estado "${existingWorkflow.status}"`,
        );
      }

      // Eliminar el workflow anterior (completado/rechazado/cancelado) para permitir re-inicio
      await this.prisma.workflowApproval.deleteMany({
        where: { workflowId: existingWorkflow.id },
      });
      await this.prisma.documentWorkflow.delete({
        where: { id: existingWorkflow.id },
      });
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

    // Verificar que el rol del usuario puede iniciar esta plantilla
    // ADMIN bypasea siempre — acceso total por rol, no por lista
    const isAdmin = userForAccess?.role === UserRole.ADMIN;
    if (!isAdmin) {
      const initiatorRoles = (template.allowedInitiatorRoles as string[]) ?? [];
      if (initiatorRoles.length > 0 && !initiatorRoles.includes(userForAccess?.role ?? '')) {
        throw new ForbiddenException(
          `Tu rol no tiene permiso para iniciar el workflow "${template.name}"`,
        );
      }
    }

    // Obtener el primer estado del workflow
    const stateDefinitions = template.stateDefinitions as unknown as StateDefinition[];
    const firstState = stateDefinitions.sort((a, b) => a.order - b.order)[0];

    if (!firstState) {
      throw new BadRequestException(
        'La plantilla de workflow no tiene estados definidos',
      );
    }

    // Verificar que hay usuarios disponibles para el primer estado
    const usersForFirst = await this.findUsersForState(firstState.role, documentDeptId);
    if (usersForFirst.length === 0) {
      throw new BadRequestException(
        `No hay usuarios con el rol "${firstState.role}" disponibles para la etapa "${firstState.state}". No se puede iniciar el workflow.`,
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

    // Pre-asignar aprobadores para el primer estado
    await Promise.all(
      usersForFirst
        .filter((u) => u.id !== userId)
        .map((u) =>
          this.prisma.workflowApproval.create({
            data: {
              workflowId: workflow.id,
              state: firstState.state,
              stateOrder: firstState.order,
              action: null,
              userId: u.id,
              comment: null,
            },
          }),
        ),
    );

    // Notificar a los usuarios con el rol requerido para el primer estado
    await this.notifyUsersForState(
      firstState.role,
      workflow.id,
      documentId,
      document.filename,
      userId,
      documentDeptId,
    );

    return workflow;
  }

  async getWorkflowByDocument(documentId: number, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

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

    // ADMIN y DIRECTOR ven todo
    if (user?.role === UserRole.ADMIN || user?.role === UserRole.DIRECTOR) {
      return workflow;
    }

    const isInitiator = workflow.initiatedById === userId;
    const hasApproved = workflow.approvals.some((a) => a.userId === userId);
    const states = workflow.template.stateDefinitions as unknown as StateDefinition[];
    const hasRoleInTemplate = states.some((s) => s.role === user?.role);

    if (!isInitiator && !hasApproved && !hasRoleInTemplate) {
      throw new ForbiddenException('No tienes acceso a este workflow');
    }

    return workflow;
  }

  async getPendingWorkflows(userId: string) {
    const NON_APPROVER_ROLES = [UserRole.PADRE, UserRole.ESTUDIANTE, UserRole.USER];
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || NON_APPROVER_ROLES.includes(user.role as UserRole)) return [];

    return this.prisma.documentWorkflow.findMany({
      where: {
        status: WorkflowStatus.IN_PROGRESS,
        approvals: { some: { userId, action: null } },
      },
      include: {
        template: true,
        document: { select: { id: true, filename: true, description: true } },
        initiatedBy: { select: { id: true, name: true, email: true } },
        approvals: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
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

    // Obtener definición del estado actual (necesaria para requiresComment + advanceWorkflow)
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

    // Buscar pre-asignación pendiente del usuario para el estado actual
    let approval = await this.prisma.workflowApproval.findFirst({
      where: { workflowId, userId, state: workflow.currentState, action: null },
    });

    if (!approval) {
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          'No tienes una aprobación pendiente asignada en este workflow',
        );
      }
      // ADMIN override: crear registro on-the-fly
      approval = await this.prisma.workflowApproval.create({
        data: {
          workflowId,
          state: workflow.currentState,
          stateOrder: workflow.currentStateOrder,
          action: null,
          userId,
          comment: null,
        },
      });
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

    // Fix 2: Capturar la versión activa del documento en el momento de la aprobación
    const currentVersionRecord = await this.prisma.documentVersion.findFirst({
      where: { documentId: workflow.documentId },
      orderBy: { version: 'desc' },
      select: { id: true },
    });

    // Actualizar el registro pre-asignado con la acción
    await this.prisma.workflowApproval.update({
      where: { id: approval.id },
      data: {
        action: approveDto.action,
        comment: approveDto.comment,
        documentVersionId: currentVersionRecord?.id ?? null,
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

      // Notificar al iniciador que el workflow fue rechazado
      await this.notificationService.notifyWorkflowCompleted(
        workflowId,
        workflow.document.id,
        workflow.initiatedById,
        workflow.document.filename,
        'REJECTED',
      );

      return {
        status: WorkflowStatus.REJECTED,
        message: 'Workflow rechazado',
      };
    } else if (approveDto.action === ApprovalAction.APPROVED) {
      // Avanzar al siguiente estado o completar
      return this.advanceWorkflow(workflowId, stateDefinitions);
    } else if (approveDto.action === ApprovalAction.REQUESTED_CHANGES) {
      // Cambiar estado a CHANGES_REQUESTED y notificar al iniciador
      await this.prisma.documentWorkflow.update({
        where: { id: workflowId },
        data: { status: WorkflowStatus.CHANGES_REQUESTED },
      });

      await this.notificationService.notifyChangesRequested(
        workflowId,
        workflow.document.id,
        workflow.initiatedById,
        workflow.document.filename,
        user.name ?? user.email,
        approveDto.comment,
      );

      return {
        status: WorkflowStatus.CHANGES_REQUESTED,
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

  async resubmitWorkflow(workflowId: number, userId: string) {
    const workflow = await this.prisma.documentWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        document: { select: { id: true, filename: true } },
        template: { select: { requiresComment: true } },
        approvals: { where: { state: undefined } },
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow con ID ${workflowId} no encontrado`);
    }

    if (workflow.status !== WorkflowStatus.CHANGES_REQUESTED) {
      throw new BadRequestException(
        'Solo se puede reenviar un workflow en estado "Cambios requeridos"',
      );
    }

    if (workflow.initiatedById !== userId) {
      throw new ForbiddenException('Solo el iniciador puede reenviar el workflow');
    }

    // Resetear los registros de aprobación del estado actual (los que tuvieron REQUESTED_CHANGES)
    await this.prisma.workflowApproval.updateMany({
      where: {
        workflowId,
        state: workflow.currentState,
        action: ApprovalAction.REQUESTED_CHANGES,
      },
      data: { action: null, comment: null },
    });

    // Volver a IN_PROGRESS
    await this.prisma.documentWorkflow.update({
      where: { id: workflowId },
      data: { status: WorkflowStatus.IN_PROGRESS },
    });

    // Notificar a los aprobadores del estado actual
    const approversToNotify = await this.prisma.workflowApproval.findMany({
      where: { workflowId, state: workflow.currentState, action: null },
      select: { userId: true },
    });

    await Promise.all(
      approversToNotify.map((a) =>
        this.notificationService.notifyApprovalRequested(
          workflowId,
          workflow.document.id,
          a.userId,
          workflow.document.filename,
        ),
      ),
    );

    return { status: WorkflowStatus.IN_PROGRESS, message: 'Workflow reenviado para revisión' };
  }

  async getMyInitiatedWorkflows(userId: string, query: MyInitiatedQueryDto) {
    const { status = 'all', page = 1, limit = 20 } = query;
    const safeLimit = Math.min(limit, 100);

    const STATUS_MAP: Record<string, WorkflowStatus[]> = {
      active:    [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING, WorkflowStatus.CHANGES_REQUESTED],
      completed: [WorkflowStatus.APPROVED, WorkflowStatus.REJECTED],
      cancelled: [WorkflowStatus.CANCELLED],
    };

    const where: any = { initiatedById: userId };
    if (status !== 'all' && STATUS_MAP[status]) {
      where.status = { in: STATUS_MAP[status] };
    }

    const skip = (page - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.documentWorkflow.findMany({
        where,
        include: {
          document: { select: { id: true, filename: true, description: true } },
          template: { select: { id: true, name: true, stateDefinitions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.documentWorkflow.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  // ============ Métodos Auxiliares ============

  private validateStateDefinitions(states: StateDefinition[]) {
    if (!states || states.length === 0) {
      throw new BadRequestException(
        'Debe definir al menos un estado en el workflow',
      );
    }

    // Verificar que los órdenes sean consecutivos y únicos (acepta base 0 o base 1)
    const orders = states.map((s) => s.order).sort((a, b) => a - b);
    const startOrder = orders[0];
    if (startOrder !== 0 && startOrder !== 1) {
      throw new BadRequestException(
        'Los órdenes de los estados deben empezar desde 0 o 1',
      );
    }
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== startOrder + i) {
        throw new BadRequestException(
          'Los órdenes de los estados deben ser consecutivos',
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
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            uploadedBy: { select: { departmentId: true } },
            course: { select: { departmentId: true } },
          },
        },
      },
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

      // Notificar al iniciador que el workflow fue aprobado
      await this.notificationService.notifyWorkflowCompleted(
        workflowId,
        workflow.document.id,
        workflow.initiatedById,
        workflow.document.filename,
        'APPROVED',
      );

      return {
        status: WorkflowStatus.APPROVED,
        message: 'Workflow completado y aprobado',
      };
    } else {
      // Avanzar al siguiente estado
      const nextState = sortedStates[nextStateIndex];
      const prevState = workflow.currentState;

      await this.prisma.documentWorkflow.update({
        where: { id: workflowId },
        data: {
          currentState: nextState.state,
          currentStateOrder: nextState.order,
        },
      });

      const deptId =
        (workflow.document as any).course?.departmentId ??
        (workflow.document as any).uploadedBy?.departmentId ??
        null;

      const usersForNext = await this.findUsersForState(nextState.role, deptId);

      // Limpiar aprobaciones pendientes no utilizadas del estado anterior
      await this.prisma.workflowApproval.deleteMany({
        where: { workflowId, state: prevState, action: null },
      });

      // Pre-asignar aprobadores para el siguiente estado
      await Promise.all(
        usersForNext
          .filter((u) => u.id !== workflow.initiatedById)
          .map((u) =>
            this.prisma.workflowApproval.create({
              data: {
                workflowId,
                state: nextState.state,
                stateOrder: nextState.order,
                action: null,
                userId: u.id,
                comment: null,
              },
            }),
          ),
      );

      // Notificar a los usuarios con el rol requerido para el siguiente estado
      await this.notifyUsersForState(
        nextState.role,
        workflowId,
        workflow.document.id,
        workflow.document.filename,
        workflow.initiatedById,
        deptId,
      );

      return {
        status: WorkflowStatus.IN_PROGRESS,
        currentState: nextState.state,
        message: `Workflow avanzado al estado "${nextState.state}"`,
      };
    }
  }

  private async findUsersForState(
    role: string,
    documentDepartmentId: number | null,
  ): Promise<{ id: string }[]> {
    const GLOBAL_ROLES = [UserRole.ADMIN, UserRole.DIRECTOR];

    if (GLOBAL_ROLES.includes(role as UserRole) || !documentDepartmentId) {
      return this.prisma.user.findMany({
        where: { role: role as PrismaUserRole },
        select: { id: true },
      });
    }

    const deptUsers = await this.prisma.user.findMany({
      where: { role: role as PrismaUserRole, departmentId: documentDepartmentId },
      select: { id: true },
    });

    if (deptUsers.length > 0) return deptUsers;
    // Fallback: si nadie en el dpto, usar todos (evita bloqueo del workflow)
    return this.prisma.user.findMany({
      where: { role: role as PrismaUserRole },
      select: { id: true },
    });
  }

  private async notifyUsersForState(
    role: string,
    workflowId: number,
    documentId: number,
    documentName: string,
    excludeUserId: string,
    departmentId?: number | null,
  ) {
    const users = await this.findUsersForState(role, departmentId ?? null);

    for (const user of users) {
      if (user.id === excludeUserId) continue;
      await this.notificationService.notifyApprovalRequested(
        workflowId,
        documentId,
        user.id,
        documentName,
      );
    }
  }
}
