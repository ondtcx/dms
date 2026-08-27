import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleService } from './role.service';

describe('RoleService', () => {
  it('returns assignmentCount while preserving role state and permissions', async () => {
    const roles = [{
      id: 1,
      key: 'editor',
      label: 'Editor',
      isActive: false,
      permissions: [{ permission: { id: 7, key: 'documents.read', label: 'Read' } }],
      _count: { assignments: 3 },
    }];
    const prisma: any = { role: { findMany: jest.fn().mockResolvedValue(roles) } };
    const service = new RoleService(prisma);

    await expect(service.findAll()).resolves.toEqual([{
      id: 1,
      key: 'editor',
      label: 'Editor',
      isActive: false,
      permissions: roles[0].permissions,
      _count: { assignments: 3 },
      assignmentCount: 3,
    }]);
    expect(prisma.role.findMany).toHaveBeenCalledWith({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { key: 'asc' },
    });
  });

  it('reports zero assignments for an active role without dropping its permissions', async () => {
    const permissions = [{ permission: { id: 8, key: 'documents.write', label: 'Write' } }];
    const prisma: any = {
      role: {
        findMany: jest.fn().mockResolvedValue([{
          id: 2,
          key: 'writer',
          label: 'Writer',
          isActive: true,
          permissions,
          _count: { assignments: 0 },
        }]),
      },
    };

    await expect(new RoleService(prisma).findAll()).resolves.toEqual([expect.objectContaining({
      key: 'writer',
      isActive: true,
      permissions,
      assignmentCount: 0,
    })]);
  });

  it('rejects duplicate keys and inactive assignments', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 2, isActive: false }) },
    };
    const prisma: any = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new RoleService(prisma);
    await expect(service.create({ key: 'admin', label: 'Admin' })).rejects.toThrow(ConflictException);
    await expect(service.assign(2, 'user')).rejects.toThrow(ForbiddenException);
  });

  it('uses effective roles.manage authority instead of the admin key', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }), update: jest.fn() },
      user: { count: jest.fn().mockResolvedValue(1), updateMany: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new RoleService(prisma);
    await expect(service.deactivate(1)).resolves.toEqual(expect.objectContaining({ isActive: false }));
    expect(tx.user.count).toHaveBeenCalledWith({
      where: {
        roleAssignments: {
          some: {
            role: {
              isActive: true,
              permissions: { some: { permission: { key: 'roles.manage', isActive: true } } },
            },
          },
        },
      },
    });
  });

  it('protects the final effective authority atomically after a lifecycle change', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }), update: jest.fn() },
      user: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new RoleService(prisma);
    await expect(service.deactivate(1)).rejects.toThrow(ForbiddenException);
    expect(tx.role.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isActive: false } });
  });

  it('rejects duplicate or inactive permissions before replacing state', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1 }), update: jest.fn() },
      permission: { findMany: jest.fn().mockResolvedValue([{ id: 4, key: 'documents.read' }]) },
      rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const service = new RoleService({
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    } as any);
    await expect(service.update(1, { permissionKeys: ['documents.read', 'documents.read'] })).rejects.toThrow(
      ConflictException,
    );
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  });

  it('bumps the assigned user revision on assignment and rejects duplicates', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      userRoleAssignment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ userId: 'u1', roleId: 1 }),
      },
    };
    const service = new RoleService({ $transaction: jest.fn(async (callback: any) => callback(tx)) } as any);
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', roleAssignments: [{ role: { id: 1, key: 'editor' } }] });
    await expect(service.assign(1, 'u1')).resolves.toEqual({ id: 'u1', catalogRoles: [{ id: 1, key: 'editor' }] });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { authRevision: { increment: 1 } } });
    tx.userRoleAssignment.findUnique.mockResolvedValue({ userId: 'u1', roleId: 1 });
    await expect(service.assign(1, 'u1')).rejects.toThrow(ConflictException);
    expect(tx.userRoleAssignment.create).toHaveBeenCalledTimes(1);
  });

  it('checks authority when removing an assignment and bumps its revision', async () => {
    const tx = {
      userRoleAssignment: { delete: jest.fn() },
      user: { update: jest.fn(), count: jest.fn().mockResolvedValue(1), findUniqueOrThrow: jest.fn() },
    };
    const service = new RoleService({ $transaction: jest.fn(async (callback: any) => callback(tx)) } as any);
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', roleAssignments: [] });
    await expect(service.removeAssignment(1, 'u1')).resolves.toEqual({ id: 'u1', catalogRoles: [] });
    expect(tx.userRoleAssignment.delete).toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { authRevision: { increment: 1 } } });
  });
});
