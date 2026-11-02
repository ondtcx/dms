import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../auth/role.enum';
import { resolveEffectiveRoleKeys } from '../role/compatibility-resolver';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

jest.mock('bcrypt', () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue('hashed') } }));

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: AuthorizationService,
          useValue: { getAuthorization: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('catalog creation', () => {
    const input = { name: 'Inspector', email: 'inspector@example.com', password: 'Password123!', catalogRoleId: 12 };
    const role = { id: 12, key: 'inspector-general', label: 'Inspector General', isActive: true, legacyRole: null };
    let tx: any;
    let prisma: any;

    beforeEach(() => {
      tx = {
        role: { findUnique: jest.fn().mockResolvedValue(role) },
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user', role: 'user', roleAssignments: [{ role }] }) },
      };
      prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      service = new UserService(prisma);
    });

    it('creates the assignment atomically and never inherits profesor', async () => {
      const result = await service.create(input as any);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          email: input.email,
          password: 'hashed',
          role: 'user',
          roleAssignments: { create: { roleId: 12 } },
        },
        select: expect.objectContaining({ roleAssignments: expect.any(Object) }),
      });
      expect(result.catalogRoles).toEqual([role]);
      expect(resolveEffectiveRoleKeys(result.role, result.catalogRoles!)).toEqual(['user', 'inspector-general']);
      expect(result).not.toHaveProperty('password');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('ignores a supplied legacy profesor role when selecting a catalog role', async () => {
      await service.create({ ...input, role: UserRole.PROFESOR } as any);
      expect(tx.user.create.mock.calls[0][0].data.role).toBe('user');
    });

    it.each([null, { ...role, isActive: false }])('rejects missing or inactive roles before creating the user', async (selectedRole) => {
      tx.role.findUnique.mockResolvedValue(selectedRole);
      await expect(service.create(input as any)).rejects.toThrow(selectedRole ? ForbiddenException : NotFoundException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, '12', null, [12, 12]])('rejects invalid and duplicate IDs at the service boundary: %p', async (catalogRoleId) => {
      await expect(service.create({ ...input, catalogRoleId } as any)).rejects.toThrow(BadRequestException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('propagates nested assignment failure without a separate persisted user write', async () => {
      tx.user.create.mockRejectedValue(new Error('Assignment constraint failure'));
      await expect(service.create(input as any)).rejects.toThrow('Assignment constraint failure');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('allows an admin to create a legacy role without a catalog selection', async () => {
      prisma.user.create.mockResolvedValue({ id: 'legacy', role: 'profesor', password: 'hashed' });
      const { catalogRoleId, ...legacy } = input;
      const authorization = {
        getAuthorization: jest.fn().mockResolvedValue({ roles: ['admin'], permissions: ['users.manage'], authRevision: 0 }),
      };
      const adminService = new UserService(prisma as any, authorization as any);

      await expect(adminService.create({ ...legacy, role: UserRole.PROFESOR }, 'admin-1')).resolves.toEqual({ id: 'legacy', role: 'profesor' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('preserves default legacy creation when both role fields are omitted', async () => {
      prisma.user.create.mockResolvedValue({ id: 'legacy', role: 'user', password: 'hashed' });
      const { catalogRoleId, ...legacy } = input;
      await expect(service.create(legacy)).resolves.toEqual({ id: 'legacy', role: 'user' });
      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('role');
    });

    it('rejects duplicate email before writing either user or assignment', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(input as any)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects creation-only catalog selection on the inherited update DTO', async () => {
      await expect(service.update('existing', { catalogRoleId: 12 } as any)).rejects.toThrow(BadRequestException);
    });
  });

  it('projects catalog roles for list and detail users', async () => {
    const user = {
      id: 'u1',
      role: 'user',
      roleAssignments: [{ role: { id: 4, key: 'editor', label: 'Editor', isActive: true } }],
    };
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([user]), findUnique: jest.fn().mockResolvedValue(user) } };
    service = new UserService(prisma as any);

    await expect(service.findAll()).resolves.toEqual([expect.objectContaining({ catalogRoles: [user.roleAssignments[0].role] })]);
    await expect(service.findById('u1')).resolves.toEqual(expect.objectContaining({ catalogRoles: [user.roleAssignments[0].role] }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ roleAssignments: expect.any(Object) }) }));
  });

  it('projects catalog roles when loading a user for login', async () => {
    const user = {
      id: 'u1',
      email: 'u1@example.com',
      password: 'hashed-password',
      role: 'user',
      roleAssignments: [{ role: { id: 4, key: 'editor', label: 'Editor', isActive: true } }],
    };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    service = new UserService(prisma as any);

    await expect(service.findByEmail(user.email)).resolves.toEqual(
      expect.objectContaining({ catalogRoles: [user.roleAssignments[0].role] }),
    );
  });

  it('returns an empty catalog role projection when login user has no assignments', async () => {
    const user = { id: 'u2', email: 'u2@example.com', password: 'hashed-password', role: 'user', roleAssignments: [] };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    service = new UserService(prisma as any);

    await expect(service.findByEmail(user.email)).resolves.toEqual(expect.objectContaining({ catalogRoles: [] }));
  });

  describe('legacy role authority', () => {
    const actorId = 'actor-1';
    let prisma: any;
    let authorization: any;

    const allowAdmin = () => authorization.getAuthorization.mockResolvedValue({
      roles: ['admin'],
      permissions: ['users.manage', 'roles.manage'],
      authRevision: 0,
    });
    const allowUserManager = () => authorization.getAuthorization.mockResolvedValue({
      roles: ['user'],
      permissions: ['users.manage'],
      authRevision: 0,
    });
    const legacyInput = {
      name: 'Legacy User',
      email: 'legacy@example.com',
      password: 'Password123!',
    };

    beforeEach(() => {
      authorization = { getAuthorization: jest.fn() };
      prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
        },
        $transaction: jest.fn(),
      };
      service = new UserService(prisma, authorization);
    });

    it('blocks a users.manage caller from promoting itself to admin', async () => {
      allowUserManager();
      prisma.user.findUnique.mockResolvedValue({ id: actorId, role: 'user', roleAssignments: [] });

      await expect(
        service.update(actorId, { role: UserRole.ADMIN } as any, actorId),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('blocks a users.manage caller from creating a legacy admin', async () => {
      allowUserManager();

      await expect(
        service.create({ ...legacyInput, role: UserRole.ADMIN } as any, actorId),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('blocks a users.manage caller from assigning the admin catalog role', async () => {
      allowUserManager();
      const adminRole = { id: 9, key: 'admin', label: 'Admin', isActive: true };
      const tx = { role: { findUnique: jest.fn().mockResolvedValue(adminRole) }, user: { create: jest.fn() } };
      prisma.$transaction.mockImplementation((callback: any) => callback(tx));

      await expect(
        service.create({ ...legacyInput, catalogRoleId: 9 } as any, actorId),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('allows an admin to create users with a legacy role', async () => {
      allowAdmin();
      prisma.user.create.mockResolvedValue({ id: 'new-user', role: 'profesor' });

      await expect(
        service.create({ ...legacyInput, role: UserRole.PROFESOR } as any, actorId),
      ).resolves.toEqual({ id: 'new-user', role: 'profesor' });
    });

    it('allows an admin to assign the admin catalog role', async () => {
      allowAdmin();
      const adminRole = { id: 9, key: 'admin', label: 'Admin', isActive: true };
      const tx = {
        role: { findUnique: jest.fn().mockResolvedValue(adminRole) },
        user: { create: jest.fn().mockResolvedValue({ id: 'new-admin', role: 'user', roleAssignments: [{ role: adminRole }] }) },
      };
      prisma.$transaction.mockImplementation((callback: any) => callback(tx));

      await expect(
        service.create({ ...legacyInput, catalogRoleId: 9 } as any, actorId),
      ).resolves.toEqual(expect.objectContaining({ id: 'new-admin' }));
    });

    it('keeps self-registration at role user without an actor', async () => {
      prisma.user.create.mockResolvedValue({ id: 'registered', role: 'user' });

      await expect(service.create({ ...legacyInput, role: UserRole.USER } as any)).resolves.toEqual({
        id: 'registered',
        role: 'user',
      });
      expect(authorization.getAuthorization).not.toHaveBeenCalled();
    });

    it('allows a users.manage caller to update profile fields without a role', async () => {
      allowUserManager();
      prisma.user.findUnique.mockResolvedValue({ id: 'target', role: 'user', roleAssignments: [] });
      prisma.user.update.mockResolvedValue({ id: 'target', role: 'user', name: 'Updated' });

      await expect(service.update('target', { name: 'Updated' } as any, actorId)).resolves.toEqual({
        id: 'target',
        role: 'user',
        name: 'Updated',
      });
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('authRevision');
    });

    it('allows a users.manage caller to save an unchanged legacy role', async () => {
      allowUserManager();
      prisma.user.findUnique.mockResolvedValue({ id: 'target', role: 'user', roleAssignments: [] });
      prisma.user.update.mockResolvedValue({ id: 'target', role: 'user', name: 'Renamed' });

      await expect(
        service.update('target', { name: 'Renamed', role: UserRole.USER } as any, actorId),
      ).resolves.toEqual({ id: 'target', role: 'user', name: 'Renamed' });
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('authRevision');
    });

    it('does not bump authRevision on an admin no-op role save', async () => {
      allowAdmin();
      prisma.user.findUnique.mockResolvedValue({ id: 'target', role: 'user', roleAssignments: [] });
      prisma.user.update.mockResolvedValue({ id: 'target', role: 'user', name: 'Renamed' });

      await expect(
        service.update('target', { name: 'Renamed', role: UserRole.USER } as any, actorId),
      ).resolves.toEqual({ id: 'target', role: 'user', name: 'Renamed' });
      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('authRevision');
    });

    it('bumps authRevision when an admin changes a legacy role', async () => {
      allowAdmin();
      prisma.user.findUnique.mockResolvedValue({ id: 'target', role: 'user', roleAssignments: [] });
      prisma.user.update.mockResolvedValue({ id: 'target', role: 'secretario', authRevision: 1 });

      await expect(
        service.update('target', { role: UserRole.SECRETARIO } as any, actorId),
      ).resolves.toEqual(expect.objectContaining({ authRevision: 1 }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: UserRole.SECRETARIO, authRevision: { increment: 1 } }),
        }),
      );
    });
  });
  describe('deactivation', () => {
    const actorId = 'admin-1';
    let prisma: any;
    let target: any;

    beforeEach(() => {
      target = {
        id: 'u1',
        email: 'u1@example.com',
        name: 'User One',
        role: 'user',
        isActive: true,
        roleAssignments: [],
      };
      prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(target),
          findMany: jest.fn().mockResolvedValue([target]),
          update: jest.fn().mockResolvedValue({ ...target, isActive: false }),
          count: jest.fn().mockResolvedValue(1),
          delete: jest.fn(),
        },
        workflowAssignment: { count: jest.fn().mockResolvedValue(0) },
        documentChangeRequest: { count: jest.fn().mockResolvedValue(0) },
        passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        $transaction: jest.fn((callback: any) => callback(prisma)),
      };
      service = new UserService(prisma as any);
    });

    it('deactivates without deleting the user and revokes pending reset tokens', async () => {
      await expect(service.deactivate('u1', actorId, 'Renuncia')).resolves.toEqual({
        message: 'Usuario desactivado exitosamente',
      });

      expect(prisma.user.delete).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          isActive: false,
          deactivatedAt: expect.any(Date),
          deactivatedById: actorId,
          deactivationReason: 'Renuncia',
          authRevision: { increment: 1 },
        }),
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', usedAt: null },
      });
    });

    it('blocks self-deactivation', async () => {
      await expect(service.deactivate('u1', 'u1')).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an already inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...target, isActive: false });
      await expect(service.deactivate('u1', actorId)).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('blocks deactivation while the user has active workflow assignments', async () => {
      prisma.workflowAssignment.count.mockResolvedValue(2);

      await expect(service.deactivate('u1', actorId)).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          message: expect.stringContaining('trabajo pendiente'),
          pending: expect.objectContaining({ workflowAssignments: 2 }),
        }),
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('does not block on assignments from cancelled or rejected workflows', async () => {
      prisma.workflowAssignment.count.mockImplementation((args: any) =>
        Promise.resolve(args?.where?.workflow?.active === true ? 0 : 1),
      );

      await expect(service.deactivate('u1', actorId)).resolves.toEqual({
        message: 'Usuario desactivado exitosamente',
      });
      expect(prisma.workflowAssignment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            status: 'PENDING',
            workflow: expect.objectContaining({ active: true }),
          }),
        }),
      );
    });

    it('blocks deactivation while the user has open change requests', async () => {
      prisma.documentChangeRequest.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      await expect(service.deactivate('u1', actorId)).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({
          pending: expect.objectContaining({ changeRequests: 1 }),
        }),
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('blocks deactivation of the last active administrator', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...target,
        role: 'admin',
        roleAssignments: [],
      });
      prisma.user.count.mockResolvedValue(0);

      await expect(service.deactivate('u1', actorId)).rejects.toThrow(
        'No puedes desactivar al último administrador activo',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('reactivates a user and invalidates old tokens', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...target, isActive: false });

      await expect(service.reactivate('u1', actorId)).resolves.toEqual({
        message: 'Usuario reactivado exitosamente',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          isActive: true,
          deactivatedAt: null,
          deactivatedById: null,
          deactivationReason: null,
          authRevision: { increment: 1 },
        }),
      });
    });

    it('filters active users by default and supports explicit status filters', async () => {
      await service.findAll();
      expect(prisma.user.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );

      await service.findAll('inactive');
      expect(prisma.user.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );

      await service.findAll('all');
      expect(prisma.user.findMany).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ where: expect.anything() }),
      );
    });

    it('only lists active users for selection', async () => {
      await service.findAllForSelection();
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

});
