import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { WorkflowAssignmentStatus, WorkflowStatus, WorkflowTransitionAction } from '@prisma/client';
import { AuthorizationService } from '../auth/compatibility/authorization.service';

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

  async assertPermission(userId: string, permission: string) {
    if (!(await this.authorization.hasPermission(userId, permission))) {
      throw new ForbiddenException('No tienes permiso para esta operación');
    }
  }

  async assertTransitionPermission(action: WorkflowTransitionAction, userId: string) {
    await this.assertPermission(userId, ACTION_PERMISSIONS[action]);
  }

  async assertStart(userId: string, userRole: string, document: any, allowedRoles: string[]) {
    await this.assertPermission(userId, 'workflow.start');
    if (document.uploadedById !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Solo el editor principal puede iniciar el workflow');
    }
    if (!this.isInitiatorRoleAllowed(userRole, allowedRoles)) {
      throw new ForbiddenException('Tu rol no puede iniciar esta definición');
    }
  }

  isInitiatorRoleAllowed(userRole: string, allowedRoles: string[]) {
    return userRole === 'admin' || !allowedRoles.length || allowedRoles.includes(userRole);
  }

  async assertHistory(userId: string, userRole: string, document: any) {
    await this.assertPermission(userId, 'workflow.view');
    const isAssigned = document.workflow?.some((workflow) => workflow.assignments?.some((assignment) => assignment.userId === userId));
    if (document.uploadedById !== userId && userRole !== 'admin' && !isAssigned) {
      throw new ForbiddenException('No tienes acceso al historial');
    }
  }

  async assertTransitionContext(action: WorkflowTransitionAction, userId: string, userRole: string, workflow: any, comment?: string) {
    await this.assertTransitionPermission(action, userId);
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
      if (workflow.initiatedById !== userId && userRole !== 'admin') {
        throw new ForbiddenException('Solo el iniciador o un administrador puede cancelar');
      }
      return;
    }
    const assignment = workflow.assignments.find(
      (item) => item.stageDefinition.order === workflow.currentStateOrder && item.userId === userId && item.status === WorkflowAssignmentStatus.PENDING,
    );
    if (!assignment) throw new ForbiddenException('No estás asignado a la etapa actual');
    if (action === WorkflowTransitionAction.APPROVE && workflow.initiatedById === userId) {
      throw new ForbiddenException('El editor principal no puede autoaprobar su documento');
    }
  }

  async assertReassignment(userId: string, workflow: any, assignment: any) {
    await this.assertPermission(userId, 'workflow.assignments.manage');
    if (!workflow.active) throw new BadRequestException('El workflow ya terminó');
    if (!assignment || assignment.workflowId !== workflow.id) throw new ForbiddenException('La asignación no pertenece al workflow');
    if (assignment.status !== WorkflowAssignmentStatus.PENDING) throw new BadRequestException('Solo se pueden reasignar asignaciones pendientes');
  }
}
