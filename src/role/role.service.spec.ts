import { ForbiddenException } from '@nestjs/common';
import { RoleService } from './role.service';

describe('RoleService', () => {
  it('rejects duplicate keys and inactive assignments', async () => {
    const prisma: any = {
      role: { findUnique: jest.fn().mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2, isActive: false }) },
      $transaction: jest.fn(async (callback: any) => callback({ role: { findUnique: jest.fn().mockResolvedValue({ id: 2, isActive: false }) } })),
    };
    const service = new RoleService(prisma);
    await expect(service.create({ key: 'admin', label: 'Admin' })).rejects.toThrow('already exists');
    await expect(service.assign(2, 'user')).rejects.toThrow(ForbiddenException);
  });

  it('protects the final administrator after a lifecycle change', async () => {
    const tx = {
      role: { findUnique: jest.fn().mockResolvedValue({ id: 1, isActive: true }), update: jest.fn() },
      user: { count: jest.fn().mockResolvedValue(0) },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new RoleService(prisma);
    await expect(service.deactivate(1)).rejects.toThrow(ForbiddenException);
    expect(tx.role.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { isActive: false } });
  });

  it('checks administrator safety when removing an assignment', async () => {
    const tx = { userRoleAssignment: { delete: jest.fn() }, user: { count: jest.fn().mockResolvedValue(0) } };
    const service = new RoleService({ $transaction: jest.fn(async (callback: any) => callback(tx)) } as any);
    await expect(service.removeAssignment(1, 'u1')).rejects.toThrow(ForbiddenException);
    expect(tx.userRoleAssignment.delete).toHaveBeenCalled();
  });
});
