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

import { NotificationService } from '../notification/notification.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';

interface StateDefinition {
  state: string;
  roleId: string;
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

    // Validar states
    this.validateStateDefinitions(createDto.states);

    const { sectionIds, initiatorRoleIds, states, ...rest } = createDto;

    return this.prisma.workflowTemplate.create({
      data: {
        ...rest,
        initiatorRoles: {
          create: initiatorRoleIds?.map((roleId) => ({ roleId })) || [],
        },
        states: {
          create: states.map((state) => ({
            state: state.state,
            roleId: state.roleId,
            order: state.order,
            requiresComment: state.requiresComment || false,
          })),
        },
        sections: sectionIds?.length
          ? { connect: sectionIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        category: true,
        sections: true,
        initiatorRoles: true,
        states: true,
      },
    });
  }

  async findAllTemplates() {
    return this.prisma.workflowTemplate.findMany({
      include: {
        category: true,
        sections: true,
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
        sections: true,
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

    // Validar states si se actualizan
    if (updateDto.states) {
      this.validateStateDefinitions(updateDto.states);
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

    const { sectionIds, initiatorRoleIds, states, ...rest } = updateDto;

    return this.prisma.workflowTemplate.update({
      where: { id },
      data: {
        ...rest,
        ...(initiatorRoleIds !== undefined && {
          initiatorRoles: {
            deleteMany: {},
            ...(initiatorRoleIds.length > 0 && {
              create: initiatorRoleIds.map((roleId) => ({ roleId })),
            }),
          },
        }),
        ...(states !== undefined && {
          states: {
            deleteMany: {},
            ...(states.length > 0 && {
              create: states.map((state) => ({
                state: state.state,
                roleId: state.roleId,
                order: state.order,
                requiresComment: state.requiresComment || false,
              })),
            }),
          },
        }),
        ...(sectionIds !== undefined
          ? { sections: { set: sectionIds.map((id) => ({ id })) } }
          : {}),
      },
      include: {
        category: true,
        sections: true,
        initiatorRoles: true,
        states: true,
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
      ? buildDocumentAccessFilter({
          ...userForAccess,
          role: userForAccess.role as unknown as string,
        })
      : null;

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null, ...(accessFilter ?? {}) },
      select: {
        id: true,
        versions: { select: { filename: true }, take: 1 },
        uploadedBy: { select: { departmentId: true } },
        academic: { select: { course: { select: { departmentId: true } } } },
      },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado o sin acceso`,
      );
    }

    const documentDeptId =
      (document.academic?.course as any)?.departmentId ??
      document.uploadedBy?.departmentId ??
      null;

    // Verificar que no haya un workflow activo para este documento
    const existingWorkflow = await this.prisma.documentWorkflow.findUnique({
      where: { documentId },
    });

    if (existingWorkflow) {
      const activeStatuses = [
        WorkflowStatus.PENDING,
        WorkflowStatus.IN_PROGRESS,
      ];
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
      include: {
        initiatorRoles: true,
        states: { include: { role: true }, orderBy: { order: 'asc' } },
      },
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
    const isAdmin = userForAccess?.role?.name === 'admin';
    if (!isAdmin) {
      const initiatorRoleIds = template.initiatorRoles.map((initiatorRole) => initiatorRole.roleId) ?? [];
      if (
        initiatorRoleIds.length > 0 &&
        !initiatorRoleIds.includes(userForAccess?.role?.id ?? '')
      ) {
        throw new ForbiddenException(
          `Tu rol no tiene permiso para iniciar el workflow "${template.name}"`,
        );
      }
    }

    // Obtener el primer estado del workflow
    const stateDefinitions = template.states.map(s => ({
      state: s.state,
      roleId: s.roleId,
      order: s.order,
      requiresComment: s.requiresComment,
    }));
    const firstState = stateDefinitions.sort((a, b) => a.order - b.order)[0];

    if (!firstState) {
      throw new BadRequestException(
        'La plantilla de workflow no tiene estados definidos',
      );
    }

    // Verificar que hay usuarios disponibles para el primer estado
    const usersForFirst = await this.findUsersForState(
      firstState.roleId,
      documentDeptId,
    );
    if (usersForFirst.length === 0) {
      throw new BadRequestException(
        `No hay usuarios con el rol requerido disponibles para la etapa "${firstState.state}". No se puede iniciar el workflow.`,
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
            versions: { select: { filename: true }, take: 1 },
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
      firstState.roleId,
      workflow.id,
      documentId,
      document.versions?.[0]?.filename,
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
            versions: { select: { filename: true }, take: 1 },
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
    if (user?.role?.name === 'admin' || user?.role?.name === 'rector') {
      return workflow;
    }

    const isInitiator = workflow.initiatedById === userId;
    const hasApproved = (workflow.approvals || []).some((a) => a.userId === userId);
    const states = (workflow.template as any).states as any[];
    const hasRoleInTemplate = states.some((s) => s.roleId === user?.role?.id);

    if (!isInitiator && !hasApproved && !hasRoleInTemplate) {
      throw new ForbiddenException('No tienes acceso a este workflow');
    }

    return workflow;
  }

  async getPendingWorkflows(userId: string) {
    const NON_APPROVER_ROLES = [
      'padre',
      'estudiante',
      'user',
    ];
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || NON_APPROVER_ROLES.includes(user.role?.name as string)) return [];

    return this.prisma.documentWorkflow.findMany({
      where: {
        status: WorkflowStatus.IN_PROGRESS,
        approvals: { some: { userId, action: null } },
      },
      include: {
        template: { include: { states: true, initiatorRoles: true } },
        document: { select: { id: true, versions: { select: { filename: true }, take: 1 }, description: true } },
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
        template: { include: { states: true } },
        document: { include: { versions: { select: { filename: true }, take: 1 } } },
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
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    // Obtener definición del estado actual (necesaria para requiresComment + advanceWorkflow)
    const stateDefinitions = workflow.template.states as unknown as StateDefinition[];
    const currentState = stateDefinitions.find(
      (s) => s.state === workflow.currentState,
    );

    if (!currentState) {
      throw new BadRequestException(
        `Estado actual "${workflow.currentState}" no encontrado en la plantilla`,
      );
    }

    const isAdmin = user.role?.name === 'admin';
    if (!isAdmin && currentState.roleId && user.role?.id !== currentState.roleId) {
      throw new ForbiddenException(
        'Tu rol no tiene permiso para aprobar el estado actual de este workflow',
      );
    }

    // Buscar pre-asignación pendiente del usuario para el estado actual
    let approval = await this.prisma.workflowApproval.findFirst({
      where: { workflowId, userId, state: workflow.currentState, action: null },
    });

    if (!approval) {
      if (!isAdmin) {
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
      (workflow.template as any).requiresComment || currentState.requiresComment;
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
        workflow.document?.id,
        workflow.initiatedById,
        workflow.document?.versions?.[0]?.filename,
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
        workflow.document?.id,
        workflow.initiatedById,
        workflow.document?.versions?.[0]?.filename,
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
      include: { document: { include: { versions: { select: { filename: true }, take: 1 } } } },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow con ID ${workflowId} no encontrado`,
      );
    }

    // Verificar que el usuario sea el iniciador o admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (
      workflow.initiatedById !== userId &&
      user?.role?.name !== 'admin' &&
      user?.role?.name !== 'rector'
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
        document: { select: { id: true, versions: { select: { filename: true }, take: 1 } } },
        template: { select: { requiresComment: true } },
        approvals: { where: { state: undefined } },
      },
    });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow con ID ${workflowId} no encontrado`,
      );
    }

    if (workflow.status !== WorkflowStatus.CHANGES_REQUESTED) {
      throw new BadRequestException(
        'Solo se puede reenviar un workflow en estado "Cambios requeridos"',
      );
    }

    if (workflow.initiatedById !== userId) {
      throw new ForbiddenException(
        'Solo el iniciador puede reenviar el workflow',
      );
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
          workflow.document?.id,
          a.userId,
          workflow.document?.versions?.[0]?.filename,
        ),
      ),
    );

    return {
      status: WorkflowStatus.IN_PROGRESS,
      message: 'Workflow reenviado para revisión',
    };
  }

  async getMyInitiatedWorkflows(userId: string, query: MyInitiatedQueryDto) {
    const { status = 'all', page = 1, limit = 20 } = query;
    const safeLimit = Math.min(limit, 100);

    const STATUS_MAP: Record<string, WorkflowStatus[]> = {
      active: [
        WorkflowStatus.IN_PROGRESS,
        WorkflowStatus.PENDING,
        WorkflowStatus.CHANGES_REQUESTED,
      ],
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
          document: { select: { id: true, versions: { select: { filename: true }, take: 1 }, description: true } },
          template: {
            select: { id: true, name: true, states: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.documentWorkflow.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
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
            versions: { select: { filename: true }, take: 1 },
            uploadedBy: { select: { departmentId: true } },
            academic: { select: { course: { select: { departmentId: true } } } },
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
      sortedStates.findIndex((s) => s.order === workflow.currentStateOrder) + 1;

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
        workflow.document?.id,
        workflow.initiatedById,
        workflow.document?.versions?.[0]?.filename,
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
        (workflow.document).academic?.course?.departmentId ??
        (workflow.document).uploadedBy?.departmentId ??
        null;

      const usersForNext = await this.findUsersForState(nextState.roleId, deptId);

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
        nextState.roleId,
        workflowId,
        workflow.document?.id,
        workflow.document?.versions?.[0]?.filename,
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
    roleId: string,
    documentDepartmentId: number | null,
  ): Promise<{ id: string }[]> {
    const roleRecord = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!roleRecord) return [];

    const GLOBAL_ROLES = ['admin', 'rector'];

    if (GLOBAL_ROLES.includes(roleRecord.name) || !documentDepartmentId) {
      return this.prisma.user.findMany({
        where: { roleId },
        select: { id: true },
      });
    }

    const deptUsers = await this.prisma.user.findMany({
      where: {
        roleId,
        departmentId: documentDepartmentId,
      },
      select: { id: true },
    });

    if (deptUsers.length > 0) return deptUsers;
    // Fallback: si nadie en el dpto, usar todos (evita bloqueo del workflow)
    return this.prisma.user.findMany({
      where: { roleId },
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
