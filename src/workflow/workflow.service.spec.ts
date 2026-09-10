import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      workflowTemplate: { findMany: jest.fn() },
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

  it('returns only active, applicable, role-allowed definitions with ordered active versions and stages', async () => {
    prisma.document.findUnique.mockResolvedValue({
      categoryId: 7,
      uploadedById: 'owner',
      workflow: [],
    });
    prisma.workflowTemplate.findMany.mockResolvedValue([
      {
        id: 2,
        name: 'Zeta',
        description: null,
        categoryId: null,
        allowedInitiatorRoles: [],
        isActive: true,
        versions: [
          {
            id: 21,
            templateId: 2,
            version: 2,
            isActive: true,
            publishedAt: null,
            snapshot: {},
            stages: [
              { id: 212, order: 2, roleKey: 'rector' },
              { id: 211, order: 1, roleKey: 'coordinador' },
            ],
          },
          { id: 20, templateId: 2, version: 1, isActive: false, publishedAt: null, snapshot: {}, stages: [] },
        ],
      },
      {
        id: 1,
        name: 'Alpha',
        description: 'Category workflow',
        categoryId: 7,
        allowedInitiatorRoles: ['secretary'],
        isActive: true,
        versions: [{
          id: 11,
          templateId: 1,
          version: 3,
          isActive: true,
          publishedAt: null,
          snapshot: { name: 'Alpha' },
          stages: [{ id: 111, order: 1, roleKey: 'rector' }],
        }],
      },
      {
        id: 3,
        name: 'Inactive',
        description: null,
        categoryId: 7,
        allowedInitiatorRoles: [],
        isActive: false,
        versions: [{ id: 31, templateId: 3, version: 1, isActive: true, publishedAt: null, snapshot: {}, stages: [] }],
      },
      {
        id: 4,
        name: 'Other category',
        description: null,
        categoryId: 9,
        allowedInitiatorRoles: [],
        isActive: true,
        versions: [{ id: 41, templateId: 4, version: 1, isActive: true, publishedAt: null, snapshot: {}, stages: [] }],
      },
      {
        id: 5,
        name: 'Other role',
        description: null,
        categoryId: null,
        allowedInitiatorRoles: ['rector'],
        isActive: true,
        versions: [{ id: 51, templateId: 5, version: 1, isActive: true, publishedAt: null, snapshot: {}, stages: [] }],
      },
    ]);

    const result = await service.findApplicableDefinitions(10, 'owner', 'secretary');

    expect(result.map((definition) => definition.name)).toEqual(['Alpha', 'Zeta']);
    expect(result[0].versions.map((version) => version.id)).toEqual([11]);
    expect(result[1].versions[0].stages.map((stage) => stage.order)).toEqual([1, 2]);
    expect(prisma.workflowTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        OR: [{ categoryId: null }, { categoryId: 7 }],
        versions: { some: { isActive: true } },
      }),
    }));
  });

  it('returns no definitions for an existing document with an active workflow', async () => {
    prisma.document.findUnique.mockResolvedValue({
      categoryId: 7,
      uploadedById: 'owner',
      workflow: [{ id: 90 }],
    });

    await expect(service.findApplicableDefinitions(10, 'owner', 'secretary')).resolves.toEqual([]);
    expect(prisma.workflowTemplate.findMany).not.toHaveBeenCalled();
  });

  it('keeps the existing administrator override for allowed initiator roles', async () => {
    prisma.document.findUnique.mockResolvedValue({ categoryId: 7, uploadedById: 'owner', workflow: [] });
    prisma.workflowTemplate.findMany.mockResolvedValue([{
      id: 5,
      name: 'Restricted',
      description: null,
      categoryId: 7,
      allowedInitiatorRoles: ['rector'],
      isActive: true,
      versions: [{
        id: 51,
        templateId: 5,
        version: 1,
        isActive: true,
        publishedAt: null,
        snapshot: {},
        stages: [{ id: 511, order: 1, roleKey: 'rector' }],
      }],
    }]);

    await expect(service.findApplicableDefinitions(10, 'admin-user', 'admin')).resolves.toHaveLength(1);
  });

  it('returns 404 for a missing document and does not query definitions', async () => {
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(service.findApplicableDefinitions(404, 'owner', 'secretary')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workflowTemplate.findMany).not.toHaveBeenCalled();
  });

  it('preserves the start permission and ownership boundary for applicability', async () => {
    prisma.document.findUnique.mockResolvedValue({ categoryId: null, uploadedById: 'owner', workflow: [] });

    await expect(service.findApplicableDefinitions(10, 'other-user', 'secretary')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workflowTemplate.findMany).not.toHaveBeenCalled();

    authorization.hasPermission.mockResolvedValue(false);
    await expect(service.findApplicableDefinitions(10, 'owner', 'secretary')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workflowTemplate.findMany).not.toHaveBeenCalled();
  });

  it('rejects a category-incompatible version through the start route', async () => {
    prisma.document.findUnique.mockResolvedValue({
      categoryId: 7,
      uploadedById: 'owner',
      versions: [{ id: 20 }],
      workflow: [],
    });
    (service as any).resolveVersion = jest.fn().mockResolvedValue({
      id: 30,
      templateId: 4,
      snapshot: {},
      template: { categoryId: 9, isActive: true, allowedInitiatorRoles: [] },
      stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
    });

    await expect(service.start(10, { versionId: 30 }, 'owner', 'secretary')).rejects.toThrow(
      'El workflow no aplica a la categoría del documento',
    );
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
