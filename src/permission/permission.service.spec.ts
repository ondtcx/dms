import { PermissionService } from './permission.service';

describe('PermissionService role compatibility', () => {
  it('writes the mapped catalog role and legacy role together', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 9, isActive: true }) },
      documentPermission: { create },
    };

    await new PermissionService(prisma).grantDocumentPermission(2, 'u1', {
      role: 'admin',
      canView: true,
    } as any);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'admin', roleId: 9 }),
    }));
  });

  it('writes a catalog-only role assignment without inventing a legacy value', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 10, isActive: true }) },
      documentPermission: { create },
    };

    await new PermissionService(prisma).grantDocumentPermission(2, 'u1', {
      roleKey: 'editor',
      canView: true,
    } as any);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: null, roleId: 10 }),
    }));
  });
});
