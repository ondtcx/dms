import { migrateRolesToRelations } from '../../prisma/migrate-roles-to-relations';

describe('migrateRolesToRelations', () => {
  it('should migrate mapped legacy roles to relation tables', async () => {
    const prisma: any = {
      role: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'role-admin', name: 'admin' },
          { id: 'role-teacher', name: 'teacher' },
          { id: 'role-director', name: 'director' },
        ]),
      },
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 1, allowedRoles: ['teacher', 'admin'] },
        ])
        .mockResolvedValueOnce([
          {
            id: 2,
            allowedInitiatorRoles: ['teacher'],
            stateDefinitions: [
              {
                state: 'pending_director',
                role: 'director',
                order: 1,
                requiresComment: true,
              },
            ],
          },
        ]),
      categoryRole: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      workflowTemplateInitiatorRole: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      workflowTemplateState: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };

    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const result = await migrateRolesToRelations(prisma, logger);

    expect(prisma.categoryRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId_roleId: { categoryId: 1, roleId: 'role-teacher' } },
      }),
    );
    expect(prisma.workflowTemplateInitiatorRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workflowTemplateId_roleId: {
            workflowTemplateId: 2,
            roleId: 'role-teacher',
          },
        },
      }),
    );
    expect(prisma.workflowTemplateState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workflowTemplateId_state: {
            workflowTemplateId: 2,
            state: 'pending_director',
          },
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        categoriesMigrated: 1,
        workflowTemplatesMigrated: 1,
      }),
    );
  });

  it('should warn and continue on unmapped roles', async () => {
    const prisma: any = {
      role: {
        findMany: jest.fn().mockResolvedValue([{ id: 'role-admin', name: 'admin' }]),
      },
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, allowedRoles: ['teacher'] }])
        .mockResolvedValueOnce([
          {
            id: 2,
            allowedInitiatorRoles: ['coordinator'],
            stateDefinitions: [{ state: 'pending', role: 'director', order: 1 }],
          },
        ]),
      categoryRole: {
        upsert: jest.fn(),
      },
      workflowTemplateInitiatorRole: {
        upsert: jest.fn(),
      },
      workflowTemplateState: {
        upsert: jest.fn(),
      },
    };

    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const result = await migrateRolesToRelations(prisma, logger);

    expect(logger.warn).toHaveBeenCalledTimes(3);
    expect(prisma.categoryRole.upsert).not.toHaveBeenCalled();
    expect(prisma.workflowTemplateInitiatorRole.upsert).not.toHaveBeenCalled();
    expect(prisma.workflowTemplateState.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        warnings: 3,
      }),
    );
  });
});
