import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { WorkflowAssignmentStatus, WorkflowStatus, WorkflowTransitionAction } from '@prisma/client';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: any;
  let authorization: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      document: { findUnique: jest.fn() },
      workflowTemplate: {},
      workflowTemplateVersion: { findFirst: jest.fn() },
      documentWorkflow: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    service = new WorkflowService(prisma, authorization);
  });

  it('rejects non-sequential definitions and unsupported empty stages', () => {
    expect(() => (service as any).validateStages([])).toThrow(BadRequestException);
    expect(() => (service as any).validateStages([{ order: 2, roleKey: 'coordinador' }])).toThrow(BadRequestException);
  });

  it('creates a new version without mutating the active version', async () => {
    prisma.workflowTemplate.findUnique = jest.fn().mockResolvedValue({
      id: 4,
      name: 'Approval',
      versions: [{ version: 1, snapshot: { stages: [{ order: 1, roleKey: 'coordinador' }] } }],
    });
    const tx = {
      workflowTemplateVersion: {
        create: jest.fn().mockResolvedValue({ id: 30, version: 2 }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.createVersion(4, {
      stages: [
        { order: 1, roleKey: 'coordinador' },
        { order: 2, roleKey: 'rector' },
      ],
    });

    expect(tx.workflowTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ templateId: 4, version: 2 }),
    }));
    expect(tx.workflowTemplateVersion.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 1 }),
    }));
  });

  it('rejects starts against an inactive definition without creating an execution', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: 10,
      uploadedById: 'owner',
      versions: [{ id: 20 }],
      workflow: [],
    });
    (service as any).resolveVersion = jest.fn().mockRejectedValue(
      new BadRequestException('No existe una versión activa de workflow'),
    );

    await expect(service.start(10, {}, 'owner', 'profesor')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an execution with a definition snapshot and hybrid assignments', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: 10,
      uploadedById: 'owner',
      versions: [{ id: 20 }],
      workflow: [],
    });
    (service as any).resolveVersion = jest.fn().mockResolvedValue({
      id: 30,
      templateId: 4,
      snapshot: { stages: [{ order: 1, roleKey: 'coordinador' }] },
      template: { isActive: true, allowedInitiatorRoles: [] },
      stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
    });
    (service as any).resolveAssignments = jest.fn().mockResolvedValue([
      { stageDefinitionId: 40, userId: 'approver', userNameSnapshot: 'Approver', roleKeySnapshot: 'coordinador' },
    ]);
    const tx = {
      documentWorkflow: {
        create: jest.fn().mockResolvedValue({ id: 50 }),
        findUnique: jest.fn().mockResolvedValue({ id: 50 }),
      },
      workflowAssignment: { createMany: jest.fn() },
      workflowEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.start(10, { comment: 'Listo' }, 'owner', 'profesor');

    expect(tx.documentWorkflow.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ definitionVersionId: 30, snapshot: { stages: [{ order: 1, roleKey: 'coordinador' }] } }),
    }));
    expect(tx.workflowAssignment.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: 'approver', userNameSnapshot: 'Approver' })],
    }));
  });

  it('translates a concurrent active-execution conflict', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, uploadedById: 'owner', versions: [{ id: 20 }], workflow: [] });
    (service as any).resolveVersion = jest.fn().mockResolvedValue({
      id: 30, templateId: 4, snapshot: {}, template: { isActive: true, allowedInitiatorRoles: [] }, stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
    });
    (service as any).resolveAssignments = jest.fn().mockResolvedValue([{ stageDefinitionId: 40, userId: 'approver', roleKeySnapshot: 'coordinador' }]);
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });

    await expect(service.start(10, {}, 'owner', 'profesor')).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks required comments and self-approval', async () => {
    const base = {
      id: 1,
      active: true,
      legacyReadOnly: false,
      status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador',
      currentStateOrder: 1,
      initiatedById: 'owner',
      assignments: [{ id: 2, userId: 'owner', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(base);
    await expect(service.transition(1, { action: WorkflowTransitionAction.REJECT }, 'owner', 'profesor')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'owner', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps terminal executions immutable and maps reassignment to a durable update', async () => {
    (service as any).getWorkflow = jest.fn().mockResolvedValue({ active: false, status: WorkflowStatus.REJECTED, legacyReadOnly: false });
    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'approver', 'profesor')).rejects.toBeInstanceOf(BadRequestException);

    prisma.documentWorkflow.findUnique.mockResolvedValue({
      id: 1,
      active: true,
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING }],
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    const tx = {
      workflowAssignment: { update: jest.fn().mockResolvedValue({ id: 2, userId: 'new-user' }) },
      workflowEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const result = await service.reassign(1, 2, { userId: 'new-user', reason: 'Ausencia' }, 'admin', 'admin');
    expect(result.userId).toBe('new-user');
    expect(tx.workflowEvent.create).toHaveBeenCalled();
  });

  it('uses the stored assignment instead of re-resolving the role during transition', async () => {
    (service as any).getWorkflow = jest.fn().mockResolvedValue({
      id: 1,
      active: true,
      legacyReadOnly: false,
      status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador',
      currentStateOrder: 1,
      initiatedById: 'owner',
      assignments: [{ id: 2, userId: 'original-approver', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    });
    (service as any).resolveAssignments = jest.fn().mockRejectedValue(new Error('must not re-resolve'));
    const tx = {
      workflowAssignment: { update: jest.fn() },
      workflowTransition: { create: jest.fn() },
      workflowEvent: { create: jest.fn() },
      documentWorkflow: { update: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'original-approver', 'profesor');

    expect(tx.workflowAssignment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 } }));
    expect((service as any).resolveAssignments).not.toHaveBeenCalled();
  });

  it('links the submitted document version and persists the submission event', async () => {
    (service as any).getWorkflow = jest.fn().mockResolvedValue({
      id: 1,
      active: true,
      legacyReadOnly: false,
      status: WorkflowStatus.CHANGES_REQUESTED,
      currentState: 'coordinador',
      currentStateOrder: 1,
      initiatedById: 'owner',
      documentId: 10,
      documentVersionId: 20,
      assignments: [],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    });
    const tx = {
      documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 21 }) },
      workflowAssignment: { updateMany: jest.fn() },
      workflowTransition: { create: jest.fn() },
      workflowEvent: { create: jest.fn() },
      documentWorkflow: {
        update: jest.fn().mockResolvedValue({ id: 1, documentVersionId: 21 }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.transition(
      1,
      { action: WorkflowTransitionAction.SUBMIT, versionId: 21 },
      'owner',
      'profesor',
    );

    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentVersionId: 21 }),
    }));
    expect(tx.workflowEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'SUBMITTED',
        payload: expect.objectContaining({ documentVersionId: 21 }),
      }),
    }));
  });
});
