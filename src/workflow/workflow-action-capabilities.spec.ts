import { ForbiddenException } from '@nestjs/common';
import { WorkflowAssignmentStatus, WorkflowStatus } from '@prisma/client';
import { WorkflowService } from './workflow.service';
import { WorkflowPolicyService } from './workflow-policy.service';

describe('workflow history action capabilities', () => {
  const baseWorkflow = {
    id: 1, documentId: 10, active: true, legacyReadOnly: false,
    status: WorkflowStatus.IN_PROGRESS, initiatedById: 'author', currentStateOrder: 1,
    documentVersionId: 20, definitionVersion: { stages: [{ order: 1, roleKey: 'profesor' }] },
    assignments: [{ id: 5, workflowId: 1, userId: 'reviewer', status: WorkflowAssignmentStatus.PENDING,
      stageDefinition: { order: 1 } }], transitions: [], events: [],
  };
  const version = { id: 20, documentId: 10, version: 1, source: 'UPLOAD_INICIAL', workflowId: null };
  let workflow: any;
  let document: any;
  let prisma: any;
  let authorization: any;
  let directory: any;
  let events: any;
  let scope: any;
  let service: WorkflowService;

  beforeEach(() => {
    workflow = { ...baseWorkflow, assignments: baseWorkflow.assignments.map((item) => ({ ...item })) };
    document = { id: 10, uploadedById: 'author', currentVersion: 1, directoryId: null,
      receptionOriginDirectoryId: null, versions: [version], workflow: [workflow] };
    scope = { reception: false, capabilities: null, directoryId: null };
    prisma = {
      document: { findUnique: jest.fn(async () => document), update: jest.fn() },
      documentWorkflow: { findMany: jest.fn(async () => [workflow]), update: jest.fn() },
      documentVersion: { findMany: jest.fn(async () => [version]), create: jest.fn() },
      workflowAssignment: { update: jest.fn() }, $transaction: jest.fn(),
    };
    authorization = { hasPermission: jest.fn(async () => true) };
    directory = { resolveDocumentReceptionScope: jest.fn(async () => scope), assertReceptionRead: jest.fn() };
    events = { publish: jest.fn() };
    service = new WorkflowService(prisma, authorization, undefined, events, directory);
  });
  const snapshot = async (actor = 'reviewer', role = 'profesor') => (await service.history(10, actor, role) as any[])[0].actionCapabilities;
  const reception = (capabilities: any) => {
    document.receptionOriginDirectoryId = 7;
    scope = { reception: true, directoryId: 7, actorId: 'reviewer', actorRole: 'profesor',
      capabilities: { submit: false, review: false, readAll: true, ...capabilities } };
  };

  it('adds operation-specific readback without changing history records or writing', async () => {
    const result = await service.history(10, 'reviewer', 'profesor') as any[];
    expect(result[0]).toMatchObject(workflow);
    expect(Object.keys(result[0])).toHaveLength(Object.keys(workflow).length + 1);
    expect(result[0].actionCapabilities).toEqual({ scope: 'ordinary', submit: false, approve: true,
      requestChanges: true, reject: true, cancel: false, reassign: true, reassignAssignmentIds: [5] });
    expect(workflow).not.toHaveProperty('actionCapabilities');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentWorkflow.update).not.toHaveBeenCalled();
    expect(prisma.documentVersion.create).not.toHaveBeenCalled();
    expect(prisma.workflowAssignment.update).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
  it('denies self-approval while preserving other previously allowed decisions', async () => {
    workflow.assignments[0].userId = 'author';
    expect(await snapshot('author')).toMatchObject({ approve: false, requestChanges: true, reject: true, cancel: true });
  });
  it('preserves ordinary admin cancellation without substituting admin for an assignment', async () => {
    workflow.assignments[0].userId = 'other';
    expect(await snapshot('reviewer', 'admin')).toMatchObject({ cancel: true, approve: false,
      requestChanges: false, reject: false });
  });
  it('preserves ordinary initiator resubmission with a valid document version', async () => {
    workflow.status = WorkflowStatus.CHANGES_REQUESTED;
    expect(await snapshot('author')).toMatchObject({ submit: true });
  });
  it('does not share permission caches between actors or subsequent history reads', async () => {
    expect(await snapshot()).toMatchObject({ approve: true });
    authorization.hasPermission.mockImplementation(async (_actor: string, permission: string) => permission === 'workflow.view');
    expect(await snapshot()).toMatchObject({ approve: false, requestChanges: false, reject: false, reassign: false });
  });
  it('bounds empty history without action or version lookups', async () => {
    prisma.documentWorkflow.findMany.mockResolvedValue([]);
    await expect(service.history(10, 'reviewer', 'profesor')).resolves.toEqual([]);
    expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
    expect(authorization.hasPermission).toHaveBeenCalledTimes(1);
  });
  it('advertises only pending assignments belonging to the current workflow', async () => {
    workflow.assignments.push({ ...workflow.assignments[0], id: 6, workflowId: 2 });
    workflow.assignments.push({ ...workflow.assignments[0], id: 7, status: WorkflowAssignmentStatus.COMPLETED });
    expect(await snapshot()).toMatchObject({ reassign: true, reassignAssignmentIds: [5] });
  });
  it('fails closed instead of treating unresolved reception capabilities as ordinary authority', async () => {
    reception({}); scope.capabilities = null;
    expect(await snapshot('reviewer', 'admin')).toEqual({ scope: 'reception', submit: false, approve: false,
      requestChanges: false, reject: false, cancel: false, reassign: false, reassignAssignmentIds: [] });
  });
  it.each([WorkflowStatus.APPROVED, WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED])(
    'does not advertise transitions on terminal %s', async (status) => {
      workflow.status = status; workflow.active = false;
      expect(await snapshot()).toEqual({ scope: 'ordinary', submit: false, approve: false,
        requestChanges: false, reject: false, cancel: false, reassign: false, reassignAssignmentIds: [] });
    },
  );
  it('keeps institution-wide admin authority out of reception review and management', async () => {
    reception({ review: false });
    expect(await snapshot('reviewer', 'admin')).toMatchObject({ scope: 'reception', approve: false,
      requestChanges: false, reject: false, cancel: false, reassign: false });
  });
  it('requires pending current-stage assignment even for a live reception reviewer', async () => {
    reception({ review: true }); workflow.assignments[0].stageDefinition = { order: 2 };
    expect(await snapshot()).toMatchObject({ approve: false, requestChanges: false, reject: false, cancel: true, reassign: true });
  });
  it('allows cancellation by a live reception reviewer without granting submission', async () => {
    reception({ review: true });
    expect(await snapshot()).toMatchObject({ cancel: true, submit: false });
  });
  it('requires the live author for initiator cancellation in reception', async () => {
    reception({ submit: false, review: true });
    expect(await snapshot('author')).toMatchObject({ cancel: false });
    scope.capabilities.submit = true;
    expect(await snapshot('author')).toMatchObject({ cancel: true });
  });
  it('advertises reception submission only for the current same-workflow correction', async () => {
    reception({ submit: true }); workflow.status = WorkflowStatus.CHANGES_REQUESTED;
    document.versions = [{ ...version, source: 'CAMBIOS_SOLICITADOS', workflowId: 1 }];
    prisma.documentVersion.findMany.mockResolvedValue(document.versions);
    expect(await snapshot('author')).toMatchObject({ submit: true, approve: false, requestChanges: false, reject: false });
    document.versions[0].workflowId = 2;
    expect(await snapshot('author')).toMatchObject({ submit: false });
  });
  it('denies correction submission when current author participation is revoked', async () => {
    reception({ submit: false }); workflow.status = WorkflowStatus.CHANGES_REQUESTED;
    document.versions = [{ ...version, source: 'CAMBIOS_SOLICITADOS', workflowId: 1 }];
    expect(await snapshot('author')).toMatchObject({ submit: false });
  });
  it('does not overgrant requestChanges after a newer document version exists', async () => {
    document.currentVersion = 2;
    document.versions = [{ ...version, id: 21, version: 2 }];
    expect(await snapshot()).toMatchObject({ approve: true, reject: true, requestChanges: false });
  });
  it('fails closed for missing or foreign reviewed versions', async () => {
    prisma.documentVersion.findMany.mockResolvedValue([{ ...version, documentId: 11 }]);
    expect(await snapshot()).toMatchObject({ approve: false, requestChanges: false, reject: false, cancel: false });
  });
  it('does not advertise transitions for legacy read-only execution', async () => {
    workflow.legacyReadOnly = true;
    expect(await snapshot()).toMatchObject({ submit: false, approve: false, requestChanges: false, reject: false, cancel: false });
  });
  it('keeps per-action permissions separate and does not grant assignment management from admin role', async () => {
    authorization.hasPermission.mockImplementation(async (_actor: string, permission: string) =>
      permission === 'workflow.view' || permission === 'workflow.reject');
    expect(await snapshot('reviewer', 'admin')).toMatchObject({ approve: false, requestChanges: false,
      reject: true, cancel: false, reassign: false });
  });
  it('bounds permission and version lookups across many history records', async () => {
    prisma.documentWorkflow.findMany.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({
      ...workflow, id: index + 1, assignments: [{ ...workflow.assignments[0], workflowId: index + 1 }],
    })));
    const rows = await service.history(10, 'reviewer', 'profesor') as any[];
    expect(rows).toHaveLength(30);
    expect(rows.every((row) => row.actionCapabilities.approve === true)).toBe(true);
    const permissions = authorization.hasPermission.mock.calls.map((call: any[]) => call[1]);
    expect(permissions).toHaveLength(7);
    expect(new Set(permissions).size).toBe(7);
    expect(prisma.documentVersion.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.documentVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { documentId: 10, id: { in: [20] } },
    }));
  });
  it('does not mask operational authorization failure as a successful false snapshot', async () => {
    authorization.hasPermission.mockImplementation(async (_actor: string, permission: string) => {
      if (permission !== 'workflow.view') throw new Error('authority unavailable');
      return true;
    });
    await expect(service.history(10, 'reviewer', 'profesor')).rejects.toThrow('authority unavailable');
  });
  it('preserves rejection before history disclosure for missing read permission', async () => {
    authorization.hasPermission.mockResolvedValue(false);
    await expect(service.history(10, 'reviewer', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.documentWorkflow.findMany).not.toHaveBeenCalled();
  });
  it('preserves null-bound ordinary cancellation without advertising unbound decisions', async () => {
    workflow.documentVersionId = null;
    expect(await snapshot('reviewer', 'admin')).toMatchObject({ cancel: true,
      approve: false, requestChanges: false, reject: false });
  });
  it('denies cancellation and decisions for a dangling reviewed version binding', async () => {
    workflow.documentVersionId = 999;
    expect(await snapshot()).toMatchObject({ cancel: false,
      approve: false, requestChanges: false, reject: false });
  });
  it('preserves self-approval prevention for a live reception author assigned to review', async () => {
    reception({ submit: true, review: true }); workflow.assignments[0].userId = 'author';
    expect(await snapshot('author')).toMatchObject({ scope: 'reception', approve: false });
  });
  it('reuses real policy assertions without persisting the readback comment sentinel', async () => {
    const policy = new WorkflowPolicyService(authorization);
    const transition = jest.spyOn(policy, 'assertTransitionContext');
    const reassign = jest.spyOn(policy, 'assertReassignment');
    jest.spyOn(policy, 'createReadbackPolicy').mockReturnValue(policy);
    const boundService = new WorkflowService(prisma, authorization, policy, events, directory);
    await boundService.history(10, 'reviewer', 'profesor');
    expect(transition).toHaveBeenCalledTimes(5);
    expect(transition.mock.calls.every((call) => call[4] === 'readback')).toBe(true);
    expect(reassign).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
    expect(workflow.transitions).toEqual([]);
  });
  it('denies direct reviewer decisions while an ordinary correction awaits resubmission', async () => {
    workflow.status = WorkflowStatus.CHANGES_REQUESTED;
    expect(await snapshot()).toMatchObject({ approve: false, requestChanges: false, reject: false, submit: false });
    expect(await snapshot('author')).toMatchObject({ submit: true });
  });
});
