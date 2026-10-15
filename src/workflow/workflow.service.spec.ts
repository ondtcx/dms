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
      workflowTemplate: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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

  it('uses and validates the selected base version when creating a version', async () => {
    prisma.workflowTemplate.findUnique.mockResolvedValue({
      id: 4,
      name: 'Approval',
      versions: [{ version: 2, snapshot: { stages: [{ order: 1, roleKey: 'latest' }] } }],
    });
    prisma.workflowTemplateVersion.findFirst.mockResolvedValue({
      snapshot: { stages: [{ order: 1, roleKey: 'base' }] },
    });
    const tx: any = { workflowTemplateVersion: { create: jest.fn().mockResolvedValue({ id: 30 }) } };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.createVersion(4, { baseVersionId: 11 });

    expect(prisma.workflowTemplateVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 11, templateId: 4 }, select: { snapshot: true },
    });
    expect(tx.workflowTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 3, stages: { create: [{ order: 1, roleKey: 'base' }] } }),
    }));
  });

  it('rejects a base version belonging to another template', async () => {
    prisma.workflowTemplate.findUnique.mockResolvedValue({ id: 4, name: 'Approval', versions: [{ version: 1, snapshot: {} }] });
    prisma.workflowTemplateVersion.findFirst.mockResolvedValue(null);

    await expect(service.createVersion(4, { baseVersionId: 99 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('activates and deactivates the explicitly selected version', async () => {
    prisma.workflowTemplateVersion.findFirst.mockResolvedValue({ id: 12 });
    const tx: any = {
      workflowTemplateVersion: {
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 12, isActive: false }),
      },
      workflowTemplate: { update: jest.fn() },
    };
    tx.workflowTemplateVersion.count = jest.fn().mockResolvedValue(0);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.activate(7, 12);
    expect(tx.workflowTemplateVersion.updateMany).toHaveBeenCalledWith({ where: { templateId: 7 }, data: { isActive: false } });
    expect(tx.workflowTemplateVersion.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12 }, data: expect.objectContaining({ isActive: true }) }));

    await service.deactivate(7, 12);
    expect(tx.workflowTemplateVersion.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12 }, data: { isActive: false } }));
    expect(tx.workflowTemplate.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { isActive: false } });
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
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue({ id: 10, uploadedById: 'owner', versions: [{ id: 20 }], workflow: [] }) },
      documentWorkflow: {
        create: jest.fn().mockResolvedValue({ id: 50 }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 50 }),
      },
      workflowTemplateVersion: { findUnique: jest.fn().mockResolvedValue({
        id: 30, templateId: 4, isActive: true,
        snapshot: { stages: [{ order: 1, roleKey: 'coordinador' }] },
        stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
        template: { isActive: true, categoryId: null, allowedInitiatorRoles: [] },
      }) },
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

    const reassignWorkflow = {
      id: 1,
      active: true,
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING }],
    };
    prisma.documentWorkflow.findUnique.mockResolvedValue(reassignWorkflow);
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(reassignWorkflow) },
      workflowAssignment: { update: jest.fn().mockResolvedValue({ id: 2, userId: 'new-user' }) },
      workflowEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const result = await service.reassign(1, 2, { userId: 'new-user', reason: 'Ausencia' }, 'admin', 'admin');
    expect(result.userId).toBe('new-user');
    expect(tx.workflowEvent.create).toHaveBeenCalled();
  });

  it('rejects request changes whose supplied version does not match the stored reviewed version', async () => {
    const workflow = {
      id: 1, active: true, legacyReadOnly: false, status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador', currentStateOrder: 1, initiatedById: 'approver', documentId: 10,
      documentVersionId: 20, assignments: [], definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    (service as any).policy.assertTransitionContext = jest.fn().mockResolvedValue(undefined);
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(workflow), update: jest.fn() },
      documentVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.REQUEST_CHANGES, comment: 'ajusta', versionId: 99 }, 'approver', 'profesor'))
      .rejects.toThrow('no corresponde');
    // La versión desincronizada se rechaza antes de consultar o clonar desde una fila.
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.documentWorkflow.update).not.toHaveBeenCalled();
  });

  it('uses the stored assignment instead of re-resolving the role during transition', async () => {
    const workflow = {
      id: 1,
      active: true,
      legacyReadOnly: false,
      status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador',
      currentStateOrder: 1,
      initiatedById: 'owner',
      assignments: [{ id: 2, userId: 'original-approver', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    (service as any).resolveAssignments = jest.fn().mockRejectedValue(new Error('must not re-resolve'));
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(workflow), update: jest.fn().mockResolvedValue({ id: 1 }) },
      workflowAssignment: { update: jest.fn() },
      workflowTransition: { create: jest.fn() },
      workflowEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'original-approver', 'profesor');

    expect(tx.workflowAssignment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 } }));
    expect((service as any).resolveAssignments).not.toHaveBeenCalled();
  });

  it('links the submitted document version and persists the submission event', async () => {
    const workflow = {
      id: 1,
      active: true,
      legacyReadOnly: false,
      status: WorkflowStatus.CHANGES_REQUESTED,
      currentState: 'coordinador',
      currentStateOrder: 1,
      initiatedById: 'owner',
      documentId: 10,
      documentVersionId: 20,
      document: { id: 10, uploadedById: 'owner', directoryId: null, receptionOriginDirectoryId: null },
      assignments: [],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 21 }) },
      workflowAssignment: { updateMany: jest.fn() },
      workflowTransition: { create: jest.fn() },
      workflowEvent: { create: jest.fn() },
      documentWorkflow: {
        findUnique: jest.fn().mockResolvedValue(workflow),
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

// T5a: la recepción es una intersección ADICIONAL con los permisos, la
// asignación, el estado y la autoaprobación vigentes. Nunca los sustituye.
describe('reception workflow scope', () => {
  let service: WorkflowService;
  let prisma: any;
  let authorization: any;
  let directory: any;
  const receptionDoc = { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2, versions: [{ id: 20 }], workflow: [], categoryId: null };
  const activeVersion = { id: 30, templateId: 4, snapshot: {}, template: { isActive: true, allowedInitiatorRoles: [], categoryId: null }, stages: [{ id: 40, order: 1, roleKey: 'coordinador' }] };
  const caps = (overrides: any = {}) => {
    const base: any = {
      owner: false, discover: true, submit: true, peerRead: false, configure: false, manageParticipants: false,
      readAll: false, review: false, manageDelegates: false, manageStructure: false, ...overrides,
    };
    // La capacidad de revisión implica lectura total, como en el resolutor real.
    if (base.review) base.readAll = true;
    return base;
  };
  const scope = (capabilityOverrides: any = {}, extra: any = {}) => ({
    reception: true, directoryId: 2, actorId: 'author', actorRole: 'profesor',
    capabilities: caps(capabilityOverrides), ...extra,
  });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      document: { findUnique: jest.fn() },
      documentWorkflow: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
      user: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'new-user' }), findMany: jest.fn() },
    };
    authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    directory = {
      resolveDocumentReceptionScope: jest.fn().mockResolvedValue(scope()),
      assertDocumentMutation: jest.fn().mockResolvedValue(true),
      assertReceptionRead: jest.fn().mockResolvedValue(undefined),
    };
    service = new WorkflowService(prisma, authorization);
    (service as any).directory = directory;
  });

  it.each(['admin', 'rector'])('denies an institution-wide %s when starting without live reception participation', async (role) => {
    prisma.document.findUnique.mockResolvedValue({ ...receptionDoc });
    (service as any).resolveVersion = jest.fn().mockResolvedValue(activeVersion);
    (service as any).resolveAssignments = jest.fn().mockResolvedValue([]);
    directory.assertDocumentMutation.mockRejectedValue(new ForbiddenException('Solo el autor puede modificar su documento de recepción'));
    prisma.$transaction.mockImplementation(async (callback: any) => callback({
      documentWorkflow: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: 50 }) },
      workflowAssignment: { createMany: jest.fn() }, workflowEvent: { create: jest.fn() },
      document: { findUnique: jest.fn().mockResolvedValue({ ...receptionDoc }) },
    }));

    await expect(service.start(10, {}, 'intruder', role)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.documentWorkflow.findMany).not.toHaveBeenCalled();
  });

  it('requires live reception review capability for a review decision even with the action permission and pending assignment', async () => {
    (service as any).getWorkflow = jest.fn().mockResolvedValue({
      id: 1, active: true, legacyReadOnly: false, status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador', currentStateOrder: 1, initiatedById: 'author', documentId: 10, documentVersionId: 20,
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, userId: 'peer', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    });
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'peer', 'profesor'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a scoped reception reviewer with the action permission, pending assignment and live review capability', async () => {
    const locked = {
      id: 1, active: true, legacyReadOnly: false, status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador', currentStateOrder: 1, initiatedById: 'author', documentId: 10, documentVersionId: 20,
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, userId: 'reviewer', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(locked);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }, { actorId: 'reviewer' }));
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(locked), update: jest.fn().mockResolvedValue({ id: 1 }) },
      workflowAssignment: { update: jest.fn() }, workflowTransition: { create: jest.fn() }, workflowEvent: { create: jest.fn() },
      documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 20 }, 'reviewer', 'profesor')).resolves.toEqual({ id: 1 });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(tx.documentWorkflow.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 } }));
  });

  it('re-checks the final reception permission through the transaction client before writing', async () => {
    const locked = {
      id: 1, active: true, legacyReadOnly: false, status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador', currentStateOrder: 1, initiatedById: 'author', documentId: 10, documentVersionId: 20,
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, userId: 'reviewer', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(locked);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }, { actorId: 'reviewer' }));
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(locked), update: jest.fn().mockResolvedValue({ id: 1 }) },
      workflowAssignment: { update: jest.fn() }, workflowTransition: { create: jest.fn() }, workflowEvent: { create: jest.fn() },
      documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 20 }, 'reviewer', 'profesor');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(authorization.hasPermission).toHaveBeenCalledWith('reviewer', 'workflow.approve', tx);
  });

  it('denies applicability discovery without current reception read and never queries definitions', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, categoryId: null, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2, workflow: [] });
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ submit: true }, { actorId: 'author' }));
    directory.assertReceptionRead.mockRejectedValue(new ForbiddenException('No tienes acceso a este documento de recepción'));
    prisma.workflowTemplate = { findMany: jest.fn().mockResolvedValue([]) };

    await expect(service.findApplicableDefinitions(10, 'author', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workflowTemplate.findMany).not.toHaveBeenCalled();
  });

  it('denies a peer participant reading reception history without the reviewer scope', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2, workflow: [] });
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ submit: true, peerRead: true }, { actorId: 'peer' }));

    await expect(service.history(10, 'peer', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.documentWorkflow.findMany).not.toHaveBeenCalled();
  });

  it('permits a scoped reviewer to read reception history with the view permission and current read', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2, workflow: [] });
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ submit: false, readAll: true, review: true }, { actorId: 'reviewer' }));

    await expect(service.history(10, 'reviewer', 'profesor')).resolves.toEqual([{ id: 1, actionCapabilities: {
      scope: 'reception', submit: false, approve: false, requestChanges: false, reject: false,
      cancel: false, reassign: false, reassignAssignmentIds: [],
    } }]);
    expect(directory.assertReceptionRead).toHaveBeenCalled();
  });

  it('denies reassignment without live reception review capability', async () => {
    prisma.documentWorkflow.findUnique.mockResolvedValue({
      id: 1, active: true, initiatedById: 'author',
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }, { actorId: 'manager' }));

    await expect(service.reassign(1, 2, { userId: 'new-user', reason: 'x' }, 'manager', 'profesor'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a reassignment target without a live folder review or read-all capability', async () => {
    const lockedWorkflow = {
      id: 1, active: true, initiatedById: 'author',
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    prisma.documentWorkflow.findUnique.mockResolvedValue(lockedWorkflow);
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    directory.resolveDocumentReceptionScope.mockImplementation(async (_db: any, _doc: any, id: string) =>
      id === 'new-user' ? scope({ review: false, readAll: false }, { actorId: 'new-user' }) : scope({ review: true }, { actorId: 'manager' }));
    prisma.$transaction.mockImplementation(async (callback: any) => callback({
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(lockedWorkflow) },
      workflowAssignment: { update: jest.fn().mockResolvedValue({ id: 2 }) }, workflowEvent: { create: jest.fn() },
    }));

    await expect(service.reassign(1, 2, { userId: 'new-user', reason: 'x' }, 'manager', 'profesor'))
      .rejects.toThrow('destino');
  });

  it('rejects a reassignment whose target does not match the stage role or is the initiator', async () => {
    const lockedWorkflow = {
      id: 1, active: true, initiatedById: 'author',
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    prisma.documentWorkflow.findUnique.mockResolvedValue(lockedWorkflow);
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    directory.resolveDocumentReceptionScope.mockImplementation(async (_db: any, _doc: any, id: string) => scope({ review: true }, { actorId: id }));
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback: any) => callback({
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(lockedWorkflow) },
      workflowAssignment: { update: jest.fn().mockResolvedValue({ id: 2 }) }, workflowEvent: { create: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    }));

    await expect(service.reassign(1, 2, { userId: 'new-user', reason: 'x' }, 'manager', 'profesor'))
      .rejects.toThrow('etapa');
  });

  it('excludes the initiator and requires live folder review for automatic stage candidates', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'author', name: 'Author', role: 'coordinador' },
      { id: 'reviewer', name: 'Reviewer', role: 'coordinador' },
    ]);
    directory.resolveDocumentReceptionScope.mockImplementation(async (_db: any, _doc: any, userId: string) =>
      userId === 'reviewer' ? scope({ review: true }, { actorId: 'reviewer' }) : scope({ review: false }, { actorId: 'author' }));
    const document = { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 };

    const assignments = await (service as any).resolveAssignments([{ id: 40, order: 1, roleKey: 'coordinador' }], { document, initiatorId: 'author' });
    expect(assignments.map((assignment: any) => assignment.userId)).toEqual(['reviewer']);
  });

  it('fails explicitly when no reception reviewer is eligible for a stage', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'author', name: 'Author', role: 'coordinador' }]);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }, { actorId: 'author' }));
    const document = { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 };

    await expect((service as any).resolveAssignments([{ id: 40, order: 1, roleKey: 'coordinador' }], { document, initiatorId: 'author' }))
      .rejects.toThrow('revisores');
  });
});

// T5a corrección: la autoridad final se relee SIEMPRE dentro de la transacción,
// independientemente de la clasificación previa, y el permiso de acción se lee por
// el cliente de transacción. Un documento admitido como ordinario que pasa a
// recepción no puede escribir con autoridad obsoleta o global.
describe('reception authority final checks', () => {
  let service: WorkflowService;
  let prisma: any;
  let authorization: any;
  let directory: any;
  let publish: jest.Mock;

  const caps = (overrides: any = {}) => {
    const base: any = {
      owner: false, discover: true, submit: true, peerRead: false, configure: false, manageParticipants: false,
      readAll: false, review: false, manageDelegates: false, manageStructure: false, ...overrides,
    };
    if (base.review) base.readAll = true;
    return base;
  };
  const scope = (capabilityOverrides: any = {}, extra: any = {}) => ({
    reception: true, directoryId: 2, actorId: 'author', actorRole: 'profesor', capabilities: caps(capabilityOverrides), ...extra,
  });
  const receptionDoc = { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2, versions: [{ id: 20 }], workflow: [], categoryId: null };
  const activeVersion = (allowedRoles: string[]) => ({
    id: 30, templateId: 4, snapshot: {}, template: { isActive: true, allowedInitiatorRoles: allowedRoles, categoryId: null },
    stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
  });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      document: { findUnique: jest.fn() },
      documentWorkflow: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      workflowTemplate: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      workflowTemplateVersion: { findFirst: jest.fn().mockResolvedValue({ id: 30 }) },
      user: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'new-user' }), findMany: jest.fn().mockResolvedValue([]) },
    };
    authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    directory = {
      resolveDocumentReceptionScope: jest.fn().mockResolvedValue(scope()),
      assertDocumentMutation: jest.fn().mockResolvedValue(true),
      assertReceptionRead: jest.fn().mockResolvedValue(undefined),
    };
    publish = jest.fn();
    service = new WorkflowService(prisma, authorization, undefined, { publish } as any);
    (service as any).directory = directory;
  });

  it('blocks an ordinary-preflight transition that turns into reception inside the transaction, with no writes or events', async () => {
    const preflight = {
      id: 1, active: true, legacyReadOnly: false, status: WorkflowStatus.IN_PROGRESS,
      currentState: 'coordinador', currentStateOrder: 1, initiatedById: 'author', documentId: 10, documentVersionId: 20,
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: null },
      assignments: [{ id: 2, userId: 'reviewer', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    const locked = { ...preflight, document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 } };
    (service as any).getWorkflow = jest.fn().mockResolvedValue(preflight);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }, { actorId: 'reviewer' }));
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(locked), update: jest.fn() },
      workflowAssignment: { update: jest.fn() }, workflowTransition: { create: jest.fn() }, workflowEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.workflowAssignment.update).not.toHaveBeenCalled();
    expect(tx.documentWorkflow.update).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('blocks an ordinary-preflight reassignment that turns into reception inside the transaction, with no writes or events', async () => {
    const base = {
      id: 1, active: true, initiatedById: 'author',
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: null },
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    const locked = { ...base, document: { ...base.document, receptionOriginDirectoryId: 2 } };
    prisma.documentWorkflow.findUnique.mockResolvedValue(base);
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }, { actorId: 'manager' }));
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(locked) },
      workflowAssignment: { update: jest.fn() }, workflowEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.reassign(1, 2, { userId: 'new-user', reason: 'x' }, 'manager', 'profesor'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.workflowAssignment.update).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('uses the authoritative database role, not the stale caller role, for the reception initiator restriction', async () => {
    prisma.document.findUnique.mockResolvedValue({ ...receptionDoc });
    (service as any).resolveVersion = jest.fn().mockResolvedValue(activeVersion(['profesor']));
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }, { actorId: 'author', actorRole: 'estudiante' }));
    prisma.$transaction.mockImplementation(async (callback: any) => callback({
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue({ ...receptionDoc }) },
      documentWorkflow: { create: jest.fn().mockResolvedValue({ id: 50 }), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ id: 50 }) },
      workflowAssignment: { createMany: jest.fn() }, workflowEvent: { create: jest.fn() },
      workflowTemplateVersion: { findFirst: jest.fn().mockResolvedValue({ id: 30 }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    }));

    await expect(service.start(10, {}, 'author', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the start permission is revoked inside the final transaction', async () => {
    prisma.document.findUnique.mockResolvedValue({ ...receptionDoc });
    (service as any).resolveVersion = jest.fn().mockResolvedValue(activeVersion([]));
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: false }, { actorId: 'author' }));
    authorization.hasPermission.mockImplementation(async (_u: string, _p: string, db?: any) => db === undefined);
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue({ ...receptionDoc }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 50 }), findUnique: jest.fn().mockResolvedValue({ id: 50 }) },
      workflowTemplateVersion: { findUnique: jest.fn().mockResolvedValue({
        id: 30, templateId: 4, isActive: true, snapshot: {},
        stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
        template: { isActive: true, categoryId: null, allowedInitiatorRoles: [] },
      }) },
      workflowAssignment: { createMany: jest.fn() }, workflowEvent: { create: jest.fn() }, user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.start(10, {}, 'author', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.documentWorkflow.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('excludes automatic reception candidates that cannot approve the stage', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'author', name: 'Author', role: 'coordinador' },
      { id: 'no-approve', name: 'NoApprove', role: 'coordinador' },
      { id: 'approver', name: 'Approver', role: 'coordinador' },
    ]);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }, { actorId: 'x' }));
    authorization.hasPermission.mockImplementation(async (id: string) => id === 'approver');
    const document = { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 };

    const assignments = await (service as any).resolveAssignments([{ id: 40, order: 1, roleKey: 'coordinador' }], { document, initiatorId: 'author' });
    expect(assignments.map((assignment: any) => assignment.userId)).toEqual(['approver']);
  });

  it('rejects a reassignment target with read-all but no live review capability', async () => {
    const locked = {
      id: 1, active: true, initiatedById: 'author',
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    prisma.documentWorkflow.findUnique.mockResolvedValue(locked);
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    directory.resolveDocumentReceptionScope.mockImplementation(async (_db: any, _doc: any, id: string) =>
      id === 'new-user' ? scope({ review: false, readAll: true }, { actorId: 'new-user' }) : scope({ review: true }, { actorId: 'manager' }));
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(locked) },
      workflowAssignment: { update: jest.fn() }, workflowEvent: { create: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'new-user' }) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.reassign(1, 2, { userId: 'new-user', reason: 'x' }, 'manager', 'profesor'))
      .rejects.toThrow('destino');
    expect(tx.workflowAssignment.update).not.toHaveBeenCalled();
  });

  it('rejects a reassignment target without the stage approval permission', async () => {
    const locked = {
      id: 1, active: true, initiatedById: 'author',
      document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
      assignments: [{ id: 2, workflowId: 1, status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
      definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    };
    prisma.documentWorkflow.findUnique.mockResolvedValue(locked);
    prisma.user.findUnique.mockResolvedValue({ id: 'new-user', name: 'New User' });
    directory.resolveDocumentReceptionScope.mockImplementation(async (_db: any, _doc: any, id: string) => scope({ review: true }, { actorId: id }));
    authorization.hasPermission.mockImplementation(async (id: string) => id !== 'new-user');
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      documentWorkflow: { findUnique: jest.fn().mockResolvedValue(locked) },
      workflowAssignment: { update: jest.fn() }, workflowEvent: { create: jest.fn() },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'new-user' }) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.reassign(1, 2, { userId: 'new-user', reason: 'x' }, 'manager', 'profesor'))
      .rejects.toThrow('aprobar');
    expect(tx.workflowAssignment.update).not.toHaveBeenCalled();
  });
});

// Definición del workflow: `updateMetadata` puede cambiar allowedInitiatorRoles,
// la categoría o la activación entre la comprobación previa y la escritura. La
// transacción final debe releer la definición vigente con el cliente de
// transacción y no confiar en la autoridad cacheada de la comprobación previa.
describe('start definition authority final checks', () => {
  let service: WorkflowService;
  let prisma: any;
  let authorization: any;
  let directory: any;
  let publish: jest.Mock;

  const document = { id: 10, uploadedById: 'author', categoryId: 7, versions: [{ id: 20 }], workflow: [], directoryId: null, receptionOriginDirectoryId: null };
  const selectedVersion = (template: any = {}) => ({
    id: 30, templateId: 4, snapshot: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    template: { isActive: true, categoryId: 7, allowedInitiatorRoles: ['profesor'], ...template },
    stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
  });
  const lockedVersion = (overrides: any = {}) => ({
    id: 30, templateId: 4, isActive: true, snapshot: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    stages: [{ id: 40, order: 1, roleKey: 'coordinador' }],
    template: { isActive: true, categoryId: 7, allowedInitiatorRoles: ['profesor'] },
    ...overrides,
  });
  const txMock = (locked: any) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    document: { findUnique: jest.fn().mockResolvedValue(document) },
    documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 50 }), findUnique: jest.fn().mockResolvedValue({ id: 50 }) },
    workflowTemplateVersion: { findUnique: jest.fn().mockResolvedValue(locked) },
    workflowAssignment: { createMany: jest.fn() },
    workflowEvent: { create: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'approver', name: 'Approver', role: 'coordinador' }]) },
  });

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      document: { findUnique: jest.fn().mockResolvedValue(document) },
    };
    authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    directory = {
      resolveDocumentReceptionScope: jest.fn().mockResolvedValue({ reception: false, directoryId: null, capabilities: null, actorId: null, actorRole: null }),
      assertDocumentMutation: jest.fn().mockResolvedValue(false),
      assertReceptionRead: jest.fn().mockResolvedValue(undefined),
    };
    publish = jest.fn();
    service = new WorkflowService(prisma, authorization, undefined, { publish } as any);
    (service as any).directory = directory;
  });

  it('denies a start whose final template no longer allows the initiator role, with no writes or events', async () => {
    (service as any).resolveVersion = jest.fn().mockResolvedValue(selectedVersion({ allowedInitiatorRoles: ['profesor'] }));
    const tx = txMock(lockedVersion({ template: { isActive: true, categoryId: 7, allowedInitiatorRoles: ['rector'] } }));
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.start(10, {}, 'author', 'profesor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.documentWorkflow.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('denies a start whose final version is deactivated, with no writes or events', async () => {
    (service as any).resolveVersion = jest.fn().mockResolvedValue(selectedVersion());
    const tx = txMock(lockedVersion({ isActive: false }));
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.start(10, {}, 'author', 'profesor')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentWorkflow.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('denies a start whose final template is disabled, with no writes or events', async () => {
    (service as any).resolveVersion = jest.fn().mockResolvedValue(selectedVersion());
    const tx = txMock(lockedVersion({ template: { isActive: false, categoryId: 7, allowedInitiatorRoles: ['profesor'] } }));
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.start(10, {}, 'author', 'profesor')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentWorkflow.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('denies a start whose final definition no longer matches the document category, with no writes or events', async () => {
    (service as any).resolveVersion = jest.fn().mockResolvedValue(selectedVersion({ categoryId: 7 }));
    const tx = txMock(lockedVersion({ template: { isActive: true, categoryId: 9, allowedInitiatorRoles: ['profesor'] } }));
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.start(10, {}, 'author', 'profesor')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentWorkflow.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('allows a start when the final definition still authorizes the initiator role', async () => {
    (service as any).resolveVersion = jest.fn().mockResolvedValue(selectedVersion());
    const tx = txMock(lockedVersion());
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.start(10, {}, 'author', 'profesor')).resolves.toEqual({ id: 50 });
    expect(tx.documentWorkflow.create).toHaveBeenCalled();
    expect(publish).toHaveBeenCalled();
  });
});

// T5b: la decisión de recepción se liga a la versión revisada exacta. La versión
// ligada del workflow es la única evidencia aceptada; enviar una versión nula,
// desincronizada, forjada o ajena falla cerrado antes de escribir, clonar o emitir.
describe('reception decision version binding (T5b)', () => {
  let service: WorkflowService;
  let prisma: any;
  let authorization: any;
  let directory: any;

  const scope = (capabilityOverrides: any = {}, extra: any = {}) => {
    const base: any = {
      owner: false, discover: true, submit: true, peerRead: false, configure: false, manageParticipants: false,
      readAll: false, review: false, manageDelegates: false, manageStructure: false, ...capabilityOverrides,
    };
    if (base.review) base.readAll = true;
    return { reception: true, directoryId: 2, actorId: 'reviewer', actorRole: 'profesor', capabilities: base, ...extra };
  };

  const receptionWorkflow = (overrides: any = {}) => ({
    id: 1, active: true, legacyReadOnly: false,
    status: WorkflowStatus.IN_PROGRESS, currentState: 'coordinador', currentStateOrder: 1,
    initiatedById: 'author', documentId: 10, documentVersionId: 20,
    document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: 2 },
    assignments: [{ id: 2, userId: 'reviewer', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
    definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    ...overrides,
  });

  const txFor = (workflow: any, overrides: any = {}) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    documentVersion: {
      findFirst: jest.fn().mockResolvedValue({ id: workflow.documentVersionId, documentId: workflow.documentId, version: workflow.documentVersionId, checksumSHA256: 'checksum-src' }),
      aggregate: jest.fn().mockResolvedValue({ _max: { version: workflow.documentVersionId } }),
      create: jest.fn().mockResolvedValue({ id: 77, version: (workflow.documentVersionId ?? 0) + 1, documentId: 10, source: 'CAMBIOS_SOLICITADOS', workflowId: workflow.id }),
      update: jest.fn().mockResolvedValue({}),
    },
    document: {
      findUnique: jest.fn().mockResolvedValue({ currentVersion: workflow.documentVersionId, checksumSHA256: 'checksum-v' }),
      update: jest.fn().mockResolvedValue({ id: workflow.documentId }),
    },
    documentWorkflow: { findUnique: jest.fn().mockResolvedValue(workflow), update: jest.fn().mockResolvedValue({ id: workflow.id }) },
    workflowAssignment: { update: jest.fn(), updateMany: jest.fn() },
    workflowTransition: { create: jest.fn() },
    workflowEvent: { create: jest.fn() },
    ...overrides,
  });

  beforeEach(() => {
    prisma = { $transaction: jest.fn(), document: { findUnique: jest.fn() }, documentWorkflow: { findUnique: jest.fn() } };
    authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    directory = {
      resolveDocumentReceptionScope: jest.fn().mockResolvedValue(scope()),
      assertDocumentMutation: jest.fn().mockResolvedValue(true),
      assertReceptionRead: jest.fn().mockResolvedValue(undefined),
    };
    service = new WorkflowService(prisma, authorization);
    (service as any).directory = directory;
  });

  it('rejects a reception decision that omits the explicit reviewed version before any write', async () => {
    const workflow = receptionWorkflow();
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowAssignment.update).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
    expect(tx.documentWorkflow.update).not.toHaveBeenCalled();
  });

  it.each([null, '20', 0, -1])('rejects a reception decision with an invalid supplied version %p', async (versionId) => {
    const workflow = receptionWorkflow();
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId } as any, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });

  it('rejects a reception decision whose supplied version is stale or foreign without consulting the row', async () => {
    const workflow = receptionWorkflow({ documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.REJECT, comment: 'no', versionId: 99 }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
  });

  it('fails closed when the workflow has no bound reviewed version', async () => {
    const workflow = receptionWorkflow({ documentVersionId: null });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 20 }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed when the bound reviewed version row is missing instead of falling back to the latest version', async () => {
    const workflow = receptionWorkflow();
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow, { documentVersion: { findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn(), create: jest.fn() } });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 20 }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).toHaveBeenCalledWith({ where: { id: 20, documentId: 10 }, select: { id: true } });
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
    expect(tx.workflowEvent.create).not.toHaveBeenCalled();
  });

  it('clones the correction from the validated reviewed row and keeps decision evidence separate from the workflow binding', async () => {
    const workflow = receptionWorkflow();
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.REQUEST_CHANGES, comment: 'ajusta', versionId: 20 }, 'reviewer', 'profesor');

    expect(tx.documentVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentId: 10, source: 'CAMBIOS_SOLICITADOS', workflowId: 1 }),
    }));
    expect(tx.workflowTransition.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentVersionId: 20 }),
    }));
    expect(tx.workflowEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ payload: expect.objectContaining({ documentVersionId: 20, correctionVersionId: 77 }) }),
    }));
    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentVersionId: 77 }),
    }));
    // El clon pasa a ser la fila vigente y la versión revisada se fecha sin perder bytes.
    expect(tx.documentVersion.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { supersededAt: expect.any(Date) } });
    expect(tx.document.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { currentVersion: 21, checksumSHA256: 'checksum-src' } });
  });

  it('rejects a reception decision when the locked workflow version changed after preflight', async () => {
    const preflight = receptionWorkflow({ documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(preflight);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const locked = receptionWorkflow({ documentVersionId: 21 });
    const tx = txFor(locked);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 20 }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });

  it('rejects a reception decision while changes are requested and not resubmitted', async () => {
    const workflow = receptionWorkflow({ status: WorkflowStatus.CHANGES_REQUESTED });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ review: true }));
    const tx = txFor(workflow);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 20 }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });

  it('rejects a reception resubmission that is not the current correction of the same workflow', async () => {
    const workflow = receptionWorkflow({ status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'author', documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ submit: true, review: false }, { actorId: 'author' }));
    const tx = txFor(workflow, { documentVersion: { findFirst: jest.fn().mockResolvedValue(null), aggregate: jest.fn(), create: jest.fn() } });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.SUBMIT, versionId: 30 }, 'author', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 30, documentId: 10, source: 'CAMBIOS_SOLICITADOS', workflowId: 1 },
      select: { id: true },
    });
    expect(tx.workflowAssignment.updateMany).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });

  it('accepts a current eligible correction resubmission of the same workflow', async () => {
    const workflow = receptionWorkflow({ status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'author', documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ submit: true, review: false }, { actorId: 'author' }));
    const tx = txFor(workflow, { documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) } });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.SUBMIT, versionId: 20 }, 'author', 'profesor');

    expect(tx.documentVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 20, documentId: 10, source: 'CAMBIOS_SOLICITADOS', workflowId: 1 },
      select: { id: true },
    });
    expect(tx.workflowAssignment.updateMany).toHaveBeenCalled();
    expect(tx.workflowTransition.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: WorkflowTransitionAction.SUBMIT, documentVersionId: 20 }),
    }));
    expect(tx.documentWorkflow.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: WorkflowStatus.IN_PROGRESS, documentVersionId: 20 }),
    }));
  });

  it('denies a reception resubmission when the author is revoked before the write', async () => {
    const workflow = receptionWorkflow({ status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'author', documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(workflow);
    directory.resolveDocumentReceptionScope.mockResolvedValue(scope({ submit: true }, { actorId: 'author' }));
    directory.assertDocumentMutation.mockRejectedValue(new ForbiddenException('revocado'));
    const tx = txFor(workflow, { documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) } });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.SUBMIT, versionId: 20 }, 'author', 'profesor'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });
});

// T5b: el contrato ordinario sigue ligando la omisión heredada a la versión revisada,
// pero una versión enviada forjada, desincronizada o ajena se rechaza antes de escribir.
describe('ordinary decision version compatibility (T5b)', () => {
  let service: WorkflowService;
  let prisma: any;
  let authorization: any;
  let directory: any;
  const neutral = { reception: false, directoryId: null, capabilities: null, actorId: null, actorRole: null };

  const workflow = (overrides: any = {}) => ({
    id: 1, active: true, legacyReadOnly: false,
    status: WorkflowStatus.IN_PROGRESS, currentState: 'coordinador', currentStateOrder: 1,
    initiatedById: 'author', documentId: 10, documentVersionId: 20,
    document: { id: 10, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: null },
    assignments: [{ id: 2, userId: 'reviewer', status: WorkflowAssignmentStatus.PENDING, stageDefinition: { order: 1 } }],
    definitionVersion: { stages: [{ order: 1, roleKey: 'coordinador' }] },
    ...overrides,
  });

  const txFor = (wf: any) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: wf.documentVersionId }) },
    documentWorkflow: { findUnique: jest.fn().mockResolvedValue(wf), update: jest.fn().mockResolvedValue({ id: wf.id }) },
    workflowAssignment: { update: jest.fn(), updateMany: jest.fn() },
    workflowTransition: { create: jest.fn() },
    workflowEvent: { create: jest.fn() },
  });

  beforeEach(() => {
    prisma = { $transaction: jest.fn(), document: { findUnique: jest.fn() }, documentWorkflow: { findUnique: jest.fn() } };
    authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    directory = {
      resolveDocumentReceptionScope: jest.fn().mockResolvedValue(neutral),
      assertDocumentMutation: jest.fn().mockResolvedValue(true),
      assertReceptionRead: jest.fn().mockResolvedValue(undefined),
    };
    service = new WorkflowService(prisma, authorization);
    (service as any).directory = directory;
  });

  it('keeps the legacy omission compatible by binding the decision to the stored reviewed version', async () => {
    const wf = workflow();
    (service as any).getWorkflow = jest.fn().mockResolvedValue(wf);
    const tx = txFor(wf);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.APPROVE }, 'reviewer', 'profesor');

    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentVersionId: 20 }),
    }));
    expect(tx.workflowEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ payload: expect.objectContaining({ documentVersionId: 20 }) }),
    }));
  });

  it('rejects an ordinary decision with a supplied version that does not match the stored reviewed version', async () => {
    const wf = workflow();
    (service as any).getWorkflow = jest.fn().mockResolvedValue(wf);
    const tx = txFor(wf);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.APPROVE, versionId: 99 }, 'reviewer', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.documentVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });

  it('uses the bound reviewed version for an ordinary cancellation and never persists a supplied foreign version', async () => {
    const wf = workflow({ documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(wf);
    const tx = txFor(wf);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await service.transition(1, { action: WorkflowTransitionAction.CANCEL, comment: 'desisto' }, 'author', 'profesor');

    expect(tx.workflowTransition.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ documentVersionId: 20 }),
    }));
  });

  it('rejects an ordinary cancellation that supplies a foreign version', async () => {
    const wf = workflow({ documentVersionId: 20 });
    (service as any).getWorkflow = jest.fn().mockResolvedValue(wf);
    const tx = txFor(wf);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.transition(1, { action: WorkflowTransitionAction.CANCEL, comment: 'desisto', versionId: 99 }, 'author', 'profesor'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.workflowTransition.create).not.toHaveBeenCalled();
  });
});
