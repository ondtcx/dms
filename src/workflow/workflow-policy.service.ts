import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, WorkflowAssignmentStatus, WorkflowStatus, WorkflowTransitionAction } from '@prisma/client';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { ReceptionCapabilities } from '../directory/directory-reception.policy';

const ACTION_PERMISSIONS: Record<string, string> = {
  [WorkflowTransitionAction.SUBMIT]: 'workflow.submit',
  [WorkflowTransitionAction.APPROVE]: 'workflow.approve',
  [WorkflowTransitionAction.REQUEST_CHANGES]: 'workflow.request_changes',
  [WorkflowTransitionAction.REJECT]: 'workflow.reject',
  [WorkflowTransitionAction.CANCEL]: 'workflow.cancel',
};

@Injectable()
export class WorkflowPolicyService {
  constructor(private readonly authorization: AuthorizationService) {}

  // Caché limitada a una lectura de historial: las escrituras conservan siempre
  // la autoridad fresca y el cliente de su propia transacción.
  createReadbackPolicy(): WorkflowPolicyService {
    const reads = new Map<string, Promise<boolean>>();
    const reader = {
      hasPermission: (userId: string, permission: string) => {
        const key = JSON.stringify([userId, permission]);
        if (!reads.has(key)) reads.set(key, this.authorization.hasPermission(userId, permission));
        return reads.get(key)!;
      },
    };
    return new WorkflowPolicyService(reader as AuthorizationService);
  }

  async assertPermission(userId: string, permission: string, db?: Prisma.TransactionClient) {
    // Sin cliente de transacción se conserva la lectura de autoridad raíz previa.
    const allowed = db
      ? await this.authorization.hasPermission(userId, permission, db)
      : await this.authorization.hasPermission(userId, permission);
    if (!allowed) {
      throw new ForbiddenException('No tienes permiso para esta operación');
    }
  }

  async assertTransitionPermission(action: WorkflowTransitionAction, userId: string, db?: Prisma.TransactionClient) {
    await this.assertPermission(userId, ACTION_PERMISSIONS[action], db);
  }

  async assertStart(userId: string, userRole: string, document: any, allowedRoles: string[], reception: ReceptionCapabilities | null = null, db?: Prisma.TransactionClient) {
    await this.assertPermission(userId, 'workflow.start', db);
    // En recepción el iniciador debe ser el autor vivo y participante; ningún rol
    // institucional (admin/rector) sustituye esa participación.
    const adminBypass = !reception && userRole === 'admin';
    if (document.uploadedById !== userId && !adminBypass) {
      throw new ForbiddenException('Solo el editor principal puede iniciar el workflow');
    }
    if (!this.isInitiatorRoleAllowed(userRole, allowedRoles, reception)) {
      throw new ForbiddenException('Tu rol no puede iniciar esta definición');
    }
  }

  isInitiatorRoleAllowed(userRole: string, allowedRoles: string[], reception: ReceptionCapabilities | null = null) {
    if (!reception && userRole === 'admin') return true;
    return !allowedRoles.length || allowedRoles.includes(userRole);
  }

  async assertHistory(userId: string, userRole: string, document: any, reception: ReceptionCapabilities | null = null, db?: Prisma.TransactionClient) {
    await this.assertPermission(userId, 'workflow.view', db);
    const isAssigned = document.workflow?.some((workflow: any) => workflow.assignments?.some((assignment: any) => assignment.userId === userId));
    if (reception) {
      // Un revisor con alcance vigente puede leer el historial; la lectura entre
      // pares es de solo lectura y no concede historial por sí sola.
      const reviewer = reception.review || reception.readAll;
      if (document.uploadedById !== userId && !isAssigned && !reviewer) {
        throw new ForbiddenException('No tienes acceso al historial');
      }
      return;
    }
    if (document.uploadedById !== userId && userRole !== 'admin' && !isAssigned) {
      throw new ForbiddenException('No tienes acceso al historial');
    }
  }

  async assertTransitionContext(action: WorkflowTransitionAction, userId: string, userRole: string, workflow: any, comment?: string, reception: ReceptionCapabilities | null = null, db?: Prisma.TransactionClient) {
    await this.assertTransitionPermission(action, userId, db);
    if (!workflow.active || [WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED, WorkflowStatus.APPROVED].includes(workflow.status)) {
      throw new BadRequestException('El workflow ya terminó');
    }
    if (new Set<string>([WorkflowTransitionAction.REQUEST_CHANGES, WorkflowTransitionAction.REJECT, WorkflowTransitionAction.CANCEL]).has(action) && !comment?.trim()) {
      throw new BadRequestException('Esta transición requiere un comentario');
    }
    if (action === WorkflowTransitionAction.SUBMIT) {
      if (workflow.initiatedById !== userId || workflow.status !== WorkflowStatus.CHANGES_REQUESTED) {
        throw new BadRequestException('Solo se puede reenviar un workflow con cambios solicitados');
      }
      return;
    }
    if (action === WorkflowTransitionAction.CANCEL) {
      if (reception) {
        if (workflow.initiatedById !== userId && !reception.review) {
          throw new ForbiddenException('Solo el iniciador o un gestor de la recepción puede cancelar');
        }
      } else if (workflow.initiatedById !== userId && userRole !== 'admin') {
        throw new ForbiddenException('Solo el iniciador o un administrador puede cancelar');
      }
      return;
    }
    const assignment = workflow.assignments.find(
      (item: any) => item.stageDefinition.order === workflow.currentStateOrder && item.userId === userId && item.status === WorkflowAssignmentStatus.PENDING,
    );
    if (!assignment) throw new ForbiddenException('No estás asignado a la etapa actual');
    // La decisión de revisión en recepción exige la capacidad viva, además de la
    // asignación pendiente, el estado y el permiso de acción.
    if (reception && !reception.review) throw new ForbiddenException('No tienes permiso de revisión en la recepción');
    if (action === WorkflowTransitionAction.APPROVE && workflow.initiatedById === userId) {
      throw new ForbiddenException('El editor principal no puede autoaprobar su documento');
    }
  }

  async assertReassignment(userId: string, workflow: any, assignment: any, reception: ReceptionCapabilities | null = null, db?: Prisma.TransactionClient) {
    await this.assertPermission(userId, 'workflow.assignments.manage', db);
    if (!workflow.active) throw new BadRequestException('El workflow ya terminó');
    if (!assignment || assignment.workflowId !== workflow.id) throw new ForbiddenException('La asignación no pertenece al workflow');
    if (assignment.status !== WorkflowAssignmentStatus.PENDING) throw new BadRequestException('Solo se pueden reasignar asignaciones pendientes');
    // En recepción el actor necesita una capacidad de revisión/gestión vigente en
    // la carpeta, nunca solo el permiso global de gestión de asignaciones.
    if (reception && !reception.review) throw new ForbiddenException('No tienes permiso de gestión en la recepción');
  }
}
