import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { WorkflowStatus, WorkflowTransitionAction } from '@prisma/client';
import { ReceptionCapabilities } from '../directory/directory-reception.policy';
import { WorkflowPolicyService } from './workflow-policy.service';

export interface WorkflowActionCapabilities {
  scope: 'ordinary' | 'reception';
  submit: boolean;
  approve: boolean;
  requestChanges: boolean;
  reject: boolean;
  cancel: boolean;
  reassign: boolean;
  reassignAssignmentIds: number[];
}

export interface WorkflowReadbackVersion {
  id: number;
  documentId: number;
  version: number;
  source: string;
  workflowId: number | null;
}

export async function resolveWorkflowActionCapabilities(
  policy: WorkflowPolicyService,
  workflow: any,
  document: { id: number; uploadedById: string; currentVersion: number; versions?: WorkflowReadbackVersion[] },
  userId: string,
  userRole: string,
  reception: ReceptionCapabilities | null,
  reviewedVersions: Map<number, WorkflowReadbackVersion>,
  receptionScope: boolean,
): Promise<WorkflowActionCapabilities> {
  const result: WorkflowActionCapabilities = {
    scope: receptionScope ? 'reception' : 'ordinary',
    submit: false, approve: false, requestChanges: false, reject: false, cancel: false,
    reassign: false, reassignAssignmentIds: [],
  };
  if (!workflow.active || workflow.documentId !== document.id || (receptionScope && !reception)) return result;

  const allowed = async (probe: () => Promise<unknown>) => {
    try { await probe(); return true; }
    catch (error) {
      // Una denegación de dominio no oculta fallos de infraestructura/autoridad.
      if (error instanceof ForbiddenException || error instanceof BadRequestException) return false;
      throw error;
    }
  };
  const boundId = workflow.documentVersionId;
  const reviewed = Number.isSafeInteger(boundId) && boundId > 0 ? reviewedVersions.get(boundId) : undefined;
  const reviewedValid = reviewed?.documentId === document.id;
  const latest = document.versions?.[0];
  const latestValid = latest?.documentId === document.id && Number.isSafeInteger(latest.id) && latest.id > 0;
  const liveAuthor = !reception || (document.uploadedById === userId && reception.submit === true);
  const decisionState = workflow.status !== WorkflowStatus.CHANGES_REQUESTED;

  if (!workflow.legacyReadOnly) {
    const probe = (action: WorkflowTransitionAction) => allowed(() =>
      policy.assertTransitionContext(action, userId, userRole, workflow, 'readback', reception));
    const maySubmit = await probe(WorkflowTransitionAction.SUBMIT);
    result.submit = maySubmit && liveAuthor && latestValid && (!reception || (
      latest.source === 'CAMBIOS_SOLICITADOS' && latest.workflowId === workflow.id && latest.id === boundId
    ));
    result.approve = await probe(WorkflowTransitionAction.APPROVE) && decisionState && reviewedValid;
    result.requestChanges = await probe(WorkflowTransitionAction.REQUEST_CHANGES) && decisionState && reviewedValid &&
      reviewed.version === document.currentVersion && latestValid && latest.version === document.currentVersion;
    result.reject = await probe(WorkflowTransitionAction.REJECT) && decisionState && reviewedValid;
    const mayCancel = await probe(WorkflowTransitionAction.CANCEL);
    result.cancel = mayCancel && (workflow.initiatedById !== userId || liveAuthor) &&
      (boundId == null || reviewedValid);
  }

  for (const assignment of workflow.assignments ?? []) {
    if (!Number.isSafeInteger(assignment.id) || assignment.id <= 0) continue;
    if (await allowed(() => policy.assertReassignment(userId, workflow, assignment, reception))) {
      result.reassignAssignmentIds.push(assignment.id);
    }
  }
  result.reassign = result.reassignAssignmentIds.length > 0;
  return result;
}
