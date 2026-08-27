import { PermissionService } from './permission.service';
import { PermissionCatalogItemDto } from './dto/permission-catalog-item.dto';

describe('PermissionService role compatibility', () => {
  it('returns the active state in the permission catalog contract', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, key: 'roles.manage', label: 'Manage roles', isActive: true },
    ]);
    const prisma: any = { permission: { findMany } };

    const catalog: PermissionCatalogItemDto[] = await new PermissionService(prisma).getCatalog();

    expect(catalog).toEqual([
      { id: 1, key: 'roles.manage', label: 'Manage roles', isActive: true },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, key: true, label: true, isActive: true },
      orderBy: { key: 'asc' },
    });
  });

  it('returns every active permission with an explicit active state', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, key: 'documents.read', label: 'Read documents', isActive: true },
      { id: 2, key: 'roles.manage', label: 'Manage roles', isActive: true },
    ]);
    const prisma: any = { permission: { findMany } };

    await expect(new PermissionService(prisma).getCatalog()).resolves.toEqual([
      { id: 1, key: 'documents.read', label: 'Read documents', isActive: true },
      { id: 2, key: 'roles.manage', label: 'Manage roles', isActive: true },
    ]);
  });

  it('dual-writes mapped catalog roles when creating a document share', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1, role: 'admin', roleId: 9 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 9, isActive: true, legacyRole: 'admin' }) },
      documentShare: { create },
    };

    await new PermissionService(prisma).createDocumentShare(2, 'u1', {
      roleKey: 'admin',
      canView: true,
    } as any);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'admin', roleId: 9 }),
    }));
  });

  it('keeps a catalog-only role share without inventing a legacy role', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1, role: null, roleId: 10 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 10, isActive: true, legacyRole: null }) },
      documentShare: { create },
    };

    await new PermissionService(prisma).createDocumentShare(2, 'u1', {
      roleKey: 'editor',
      canView: true,
    } as any);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: null, roleId: 10 }),
    }));
  });

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
