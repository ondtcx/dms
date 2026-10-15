import { PermissionService } from './permission.service';
import { PermissionCatalogItemDto } from './dto/permission-catalog-item.dto';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { UserRole } from '../auth/role.enum';

describe('effective document access list', () => {
  function fixture() {
    const users = [
      { id: 'a', name: 'Allowed', email: 'a@example.test', role: UserRole.PROFESOR, roleAssignments: [{ role: { id: 9, key: 'editor', isActive: true } }] },
      { id: 'b', name: 'Denied', email: 'b@example.test', role: UserRole.USER, roleAssignments: [] },
    ];
    const db: any = {
      document: {
        findUnique: jest.fn().mockResolvedValue({ id: 2, uploadedById: 'admin' }),
        findFirst: jest.fn().mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'admin', role: UserRole.ADMIN, roleAssignments: [] }),
        findMany: jest.fn().mockResolvedValue(users),
      },
    };
    db.$transaction = jest.fn(async queries => Promise.all(queries));
    return { db, users, service: new PermissionService(db) };
  }

  it('lists only effective readers using the authoritative filter and bounded candidate queries', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T12:00:00Z'));
    try {
      const { service, db, users } = fixture();
      await expect((service as any).getEffectiveAccess(2, 'admin')).resolves.toEqual({
        documentId: 2, users: [{ id: 'a', name: 'Allowed', email: 'a@example.test', role: UserRole.PROFESOR }], nextCursor: null,
      });
      expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 26, orderBy: { id: 'asc' } }));
      for (const [index, user] of users.entries()) {
        expect(db.document.findFirst.mock.calls[index][0]).toEqual({
          where: { id: 2, ...buildDocumentAccessFilter({ id: user.id, role: user.role, assignments: user.roleAssignments.map(({ role }) => role) }) },
          select: { id: true },
        });
      }
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array));
    } finally { jest.useRealTimers(); }
  });

  it('returns a candidate cursor even when a bounded page has no readers', async () => {
    const { service, db, users } = fixture();
    db.user.findMany.mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({ ...users[1], id: String(i).padStart(2, '0') })));
    db.document.findFirst.mockReset().mockResolvedValue(null);
    await expect((service as any).getEffectiveAccess(2, 'admin', 'previous')).resolves.toMatchObject({ users: [], nextCursor: '24' });
    expect(db.document.findFirst).toHaveBeenCalledTimes(25);
    expect(db.user.findMany.mock.calls[0][0].where).toEqual({ id: { gt: 'previous' } });
  });

  it('rejects an ordinary document reader who is not an access manager before listing users', async () => {
    const { service, db } = fixture();
    db.user.findUnique.mockResolvedValue({ id: 'other', role: UserRole.COORDINADOR });
    await expect((service as any).getEffectiveAccess(2, 'other')).rejects.toThrow('gestionar');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('rejects managers without an existing access-audit role', async () => {
    const { service, db } = fixture();
    db.user.findUnique.mockResolvedValue({ id: 'admin', role: UserRole.USER });
    await expect((service as any).getEffectiveAccess(2, 'admin')).rejects.toThrow('auditar');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { receptionOriginDirectoryId: 7 },
    { directory: { receptionEnabled: true } },
  ])('preserves the existing reception access-management restriction: %j', async protection => {
    const { service, db } = fixture();
    db.document.findUnique.mockResolvedValue({ id: 2, uploadedById: 'admin', ...protection });
    await expect(service.getEffectiveAccess(2, 'admin')).rejects.toThrow('gestionar');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it.each([null, { id: 2, deletedAt: new Date() }])('does not expose users for an unavailable document: %j', async document => {
    const { service, db } = fixture();
    db.document.findUnique.mockResolvedValue(document);
    await expect(service.getEffectiveAccess(2, 'admin')).rejects.toThrow('Documento no encontrado');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('does not expose users for a quarantined document', async () => {
    const { service, db } = fixture();
    db.workflowResidueCandidate = { findMany: jest.fn().mockResolvedValue([{ rootId: '2' }]) };
    await expect(service.getEffectiveAccess(2, 'admin')).rejects.toThrow('Documento no encontrado');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('accepts an effective catalog audit role without broadening the primary-role policy', async () => {
    const { service, db } = fixture();
    db.user.findUnique.mockResolvedValue({ id: 'admin', role: UserRole.USER, roleAssignments: [{ role: { key: 'coordinador', isActive: true } }] });
    await expect(service.getEffectiveAccess(2, 'admin')).resolves.toHaveProperty('users');
  });

  it.each(['', ' ', 'x'.repeat(201), ['a']])('rejects malformed cursors before any database access: %j', async cursor => {
    const { service, db } = fixture();
    await expect(service.getEffectiveAccess(2, 'admin', cursor as string)).rejects.toThrow('Cursor');
    expect(db.document.findUnique).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.RECTOR, UserRole.PROFESOR, UserRole.COORDINADOR, UserRole.ESTUDIANTE, UserRole.PADRE, UserRole.USER])
    ('delegates every candidate role %s to the same authoritative document reader', async role => {
      const { service, db, users } = fixture();
      db.user.findMany.mockResolvedValue([{ ...users[0], role }]);
      await service.getEffectiveAccess(2, 'admin');
      const where = db.document.findFirst.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(3);
      expect(where.OR[2]).toHaveProperty('OR');
      if (role !== UserRole.ADMIN && role !== UserRole.RECTOR) {
        const ordinary = where.OR[0].AND[1].OR;
        expect(ordinary).toContainEqual({ uploadedById: 'a' });
        expect(ordinary).toContainEqual({ isPublic: true });
        expect(ordinary).toContainEqual(expect.objectContaining({ shares: { some: expect.objectContaining({ revokedAt: null, canView: true }) } }));
        expect(ordinary).toContainEqual(expect.objectContaining({ permissions: { some: expect.objectContaining({ userId: 'a', AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }] }] }) } }));
        if (role === UserRole.PROFESOR) {
          expect(ordinary).not.toContainEqual({ academic: { course: { teachers: { some: { userId: 'a' } } } } });
          expect(ordinary).not.toContainEqual({ academic: { subject: { teachers: { some: { userId: 'a' } } } } });
        }
      }
    });
});

describe('sharing management', () => {
  function fixture(role = 'user', actor = 'owner') {
    const document = { id: 2, uploadedById: 'owner', isPublic: false };
    const db: any = {
      document: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn() },
      user: { findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id === actor ? { id: actor, role } : { id: where.id, name: 'Recipient', email: 'r@example.test' })), findMany: jest.fn().mockResolvedValue([]) },
      documentPermission: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue({ id: 8, documentId: 2 }), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
      documentShare: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), create: jest.fn() },
      accessGrant: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 3, ...data })), update: jest.fn(async ({ data }) => ({ id: 3, ...data })), updateMany: jest.fn() },
      notification: { create: jest.fn() },
      effectiveAccessGrant: { findMany: jest.fn().mockResolvedValue([]) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      $queryRaw: jest.fn(),
    };
    db.$transaction = jest.fn((callback) => callback(db));
    return { db, service: new PermissionService(db) };
  }
  it.each(['user', 'rector', 'coordinador', 'vicerrector'])('denies every manager operation for non-owner %s', async (role) => {
    const { service, db } = fixture(role, 'other');
    const calls = [
      () => service.getSharing(2, 'other'),
      () => service.searchRecipients(2, 'other', { query: 'ab' }),
      () => service.grantRead(2, 'other', { userId: 'recipient' }),
      () => service.revokeRead(2, 'other', 'recipient'),
      () => service.setVisibility(2, 'other', { isPublic: true }),
      () => service.createDocumentShare(2, 'other', { userId: 'recipient' }),
      () => service.getDocumentPermissions(2, 'other'),
      () => service.revokeDocumentPermission(8, 'other'),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('No tienes permiso para gestionar');
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.documentPermission.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    ['user', 'owner', { receptionOriginDirectoryId: 7, directory: { receptionEnabled: false } }],
    ['admin', 'admin', { receptionOriginDirectoryId: 7, directory: { receptionEnabled: false } }],
    ['user', 'owner', { receptionOriginDirectoryId: null, directory: { receptionEnabled: true } }],
    ['admin', 'admin', { receptionOriginDirectoryId: null, directory: { receptionEnabled: true } }],
  ])('denies protected reception sharing for %s %s', async (role: string, actor: string, protection: object) => {
    const { service, db } = fixture(role, actor);
    db.document.findUnique.mockResolvedValue({ id: 2, uploadedById: 'owner', isPublic: false, ...protection });
    const calls = [
      () => service.getSharing(2, actor),
      () => service.searchRecipients(2, actor, { query: 'ab' }),
      () => service.grantRead(2, actor, { userId: 'recipient' }),
      () => service.revokeRead(2, actor, 'recipient'),
      () => service.setVisibility(2, actor, { isPublic: true }),
      () => service.grantDocumentPermission(2, actor, { userId: 'recipient' }),
      () => service.createDocumentShare(2, actor, { userId: 'recipient' }),
      () => service.getDocumentPermissions(2, actor),
      () => service.revokeDocumentPermission(8, actor),
      () => service.explainPermission({ documentId: 2, userId: 'recipient' }, actor),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('No tienes permiso para gestionar');
    expect(db.document.findUnique).toHaveBeenCalledWith({
      where: { id: 2 }, include: { directory: { select: { receptionEnabled: true } } },
    });
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.documentPermission.findMany).not.toHaveBeenCalled();
    expect(db.documentShare.findMany).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.documentPermission.create).not.toHaveBeenCalled();
    expect(db.documentPermission.updateMany).not.toHaveBeenCalled();
    expect(db.documentPermission.delete).not.toHaveBeenCalled();
    expect(db.documentShare.create).not.toHaveBeenCalled();
    expect(db.documentShare.updateMany).not.toHaveBeenCalled();
  });
  it.each([['user', 'owner'], ['admin', 'owner']])('allows %s owner manager operations', async (role, actor) => {
    const { service, db } = fixture(role, actor);
    await service.getSharing(2, actor);
    await service.searchRecipients(2, actor, { query: ' ab ' });
    await service.grantRead(2, actor, { userId: 'recipient' });
    await service.revokeRead(2, actor, 'recipient');
    await service.setVisibility(2, actor, { isPublic: true });
    await service.getDocumentPermissions(2, actor);
    await service.revokeDocumentPermission(8, actor);
    expect(db.accessGrant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ canView: true, canEdit: false, canUploadVersion: false, canShare: false, grantedById: actor }) });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'recipient', documentId: 2, type: 'DOCUMENT_SHARED' }) });
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20, select: { id: true, name: true, email: true } }));
    expect(db.documentShare.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ canView: false, revokedById: actor }) }));
  });
  it.each(['grantRead', 'revokeRead', 'setVisibility', 'grantDocumentPermission', 'createDocumentShare', 'revokeDocumentPermission'])
    ('rechecks reception protection under a Serializable document lock for %s', async operation => {
      const { service, db } = fixture();
      db.$queryRaw.mockImplementation(async () => {
        db.document.findUnique.mockResolvedValue({ id: 2, uploadedById: 'owner', receptionOriginDirectoryId: 7, isPublic: false });
      });
      const calls = {
        grantRead: () => service.grantRead(2, 'owner', { userId: 'recipient' }),
        revokeRead: () => service.revokeRead(2, 'owner', 'recipient'),
        setVisibility: () => service.setVisibility(2, 'owner', { isPublic: true }),
        grantDocumentPermission: () => service.grantDocumentPermission(2, 'owner', { userId: 'recipient' }),
        createDocumentShare: () => service.createDocumentShare(2, 'owner', { userId: 'recipient' }),
        revokeDocumentPermission: () => service.revokeDocumentPermission(8, 'owner'),
      };
      await expect(calls[operation]()).rejects.toThrow('No tienes permiso para gestionar');
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
      expect(db.document.update).not.toHaveBeenCalled();
      expect(db.documentPermission.create).not.toHaveBeenCalled();
      expect(db.documentPermission.updateMany).not.toHaveBeenCalled();
      expect(db.documentPermission.delete).not.toHaveBeenCalled();
      expect(db.documentShare.create).not.toHaveBeenCalled();
      expect(db.documentShare.updateMany).not.toHaveBeenCalled();
    });
  it('revalidates permission-ID targets after locking their document', async () => {
    const { service, db } = fixture();
    db.documentPermission.findUnique.mockResolvedValueOnce({ id: 8, documentId: 2 }).mockResolvedValueOnce({ id: 8, documentId: 3 });
    await expect(service.revokeDocumentPermission(8, 'owner')).rejects.toThrow('permiso cambió');
    expect(db.documentPermission.findUnique).toHaveBeenCalledTimes(2);
    expect(db.documentPermission.delete).not.toHaveBeenCalled();
  });
  it('checks current manager identity and workflow inside the transaction client', async () => {
    const { service, db } = fixture('admin', 'admin');
    const tx: any = {
      ...db,
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2, uploadedById: 'owner', isPublic: false }), update: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin', role: 'user' }) },
    };
    db.$transaction.mockImplementation(async cb => cb(tx));
    await expect(service.setVisibility(2, 'admin', { isPublic: true })).rejects.toThrow('gestionar');
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(tx.document.update).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
    tx.user.findUnique.mockResolvedValue({ id: 'owner', role: 'user' });
    tx.documentWorkflow = { findFirst: jest.fn().mockResolvedValue({ status: 'PENDING', initiatedById: 'owner' }) };
    await expect(service.setVisibility(2, 'owner', { isPublic: true })).rejects.toThrow('workflow activo');
    expect(tx.documentWorkflow.findFirst).toHaveBeenCalled();
    expect(db.documentWorkflow.findFirst).not.toHaveBeenCalled();
    expect(tx.document.update).not.toHaveBeenCalled();
  });
  it('fails closed on a Serializable authorization conflict', async () => {
    const { service, db } = fixture();
    db.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(service.grantRead(2, 'owner', { userId: 'recipient' })).rejects.toThrow('acceso cambió');
    expect(db.documentPermission.create).not.toHaveBeenCalled();
  });
  it('updates only the actor own grant and preserves legacy read recipients', async () => {
    const { service, db } = fixture();
    db.documentPermission.findFirst.mockResolvedValue({ id: 1 });
    db.accessGrant.findFirst.mockResolvedValue({ id: 3 });
    await service.grantRead(2, 'owner', { userId: 'recipient' });
    expect(db.documentPermission.create).not.toHaveBeenCalled();
    expect(db.accessGrant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3 } }));
    const user = { id: 'recipient', name: 'Name', email: 'r@example.test' };
    db.documentPermission.findMany.mockResolvedValue([{ user }]);
    db.documentShare.findMany.mockResolvedValue([{ user }]);
    await expect(service.getSharing(2, 'owner')).resolves.toMatchObject({ documentId: 2, isPublic: false, canManageSharing: true, recipients: [user] });
    expect(db.documentShare.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ revokedAt: null, canView: true, OR: expect.any(Array) }));
  });
  it('lets a secretario owner update only the selected delegate grant', async () => {
    const { service, db } = fixture('secretario');
    const previous = { id: 42, documentId: 2, userId: 'recipient', grantedById: 'delegate', revokedAt: null, canEdit: true };
    db.accessGrant.findUnique = jest.fn().mockResolvedValue(previous);
    db.effectiveAccessGrant.findMany.mockResolvedValue([{ id: 42 }]);
    await service.grantRead(2, 'owner', { userId: 'recipient', grantId: 42, canEdit: false } as any);
    expect(db.accessGrant.update).toHaveBeenCalledWith({ where: { id: 42 }, data: expect.objectContaining({ canEdit: false }) });
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
  it('aligns grant expiry aggregation with read access at the exact expiration instant', async () => {
    const { service, db } = fixture();
    await service.getSharing(2, 'owner');
    const expectedExpiry = [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }];
    expect(db.documentPermission.findMany.mock.calls[0][0].where.OR).toEqual(expectedExpiry);
    expect(db.documentShare.findMany.mock.calls[0][0].where.OR).toEqual(expectedExpiry);
  });
  it.each(['owner', '', ' recipient '])('rejects invalid/self recipient %j', async (userId) => {
    const { service, db } = fixture();
    await expect(service.grantRead(2, 'owner', { userId })).rejects.toThrow();
    expect(db.documentPermission.create).not.toHaveBeenCalled();
  });
  it.each([null, { id: 'recipient', lockedUntil: new Date('2099-01-01') }])('rejects missing/locked recipient %j', async (recipient) => {
    const { service, db } = fixture();
    db.user.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === 'owner' ? { id: 'owner', role: 'user' } : recipient));
    await expect(service.grantRead(2, 'owner', { userId: 'recipient' })).rejects.toThrow('Destinatario no disponible');
  });
  it('rejects invalid DTOs, unavailable documents and workflow visibility edits', async () => {
    const { service, db } = fixture();
    await expect(service.searchRecipients(2, 'owner', { query: ' a ' })).rejects.toThrow();
    await expect(service.grantRead(2, 'owner', { userId: 'recipient', canDelete: true } as any)).rejects.toThrow();
    await expect(service.createDocumentShare(2, 'owner', { userId: 'recipient', isPublicLink: true } as any)).rejects.toThrow();
    db.documentWorkflow.findFirst.mockResolvedValue({ status: 'PENDING' });
    await expect(service.setVisibility(2, 'owner', { isPublic: true })).rejects.toThrow('workflow activo');
    db.document.findUnique.mockResolvedValue({ id: 2, uploadedById: 'owner', deletedAt: new Date() });
    await expect(service.getSharing(2, 'owner')).rejects.toThrow('Documento no encontrado');
    db.document.findUnique.mockResolvedValue({ id: 2, uploadedById: 'owner' });
    db.workflowResidueCandidate = { findMany: jest.fn().mockResolvedValue([{ rootId: '2' }]) };
    await expect(service.getSharing(2, 'owner')).rejects.toThrow('Documento no encontrado');
  });
});

describe('PermissionService role compatibility', () => {
  it.each(['user', 'rector', 'coordinador', 'vicerrector'])('denies legacy grants by non-owner %s', async (role) => {
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2, uploadedById: 'owner' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'other', role }) },
      documentPermission: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn(async cb => cb(prisma));
    prisma.$queryRaw = jest.fn();
    await expect(new PermissionService(prisma).grantDocumentPermission(2, 'other', { userId: 'recipient' }))
      .rejects.toThrow('No tienes permiso para gestionar');
    expect(prisma.documentPermission.create).not.toHaveBeenCalled();
  });
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

  it('rejects mapped catalog role shares', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1, role: 'admin', roleId: 9 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: 'admin' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 9, isActive: true, legacyRole: 'admin' }) },
      documentShare: { create },
    };

    prisma.$transaction = jest.fn(async cb => cb(prisma));
    prisma.$queryRaw = jest.fn();
    await expect(new PermissionService(prisma).createDocumentShare(2, 'u1', {
      roleKey: 'admin',
      canView: true,
    } as any)).rejects.toThrow('usuarios');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects catalog-only role shares', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1, role: null, roleId: 10 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: 'admin' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 10, isActive: true, legacyRole: null }) },
      documentShare: { create },
    };

    prisma.$transaction = jest.fn(async cb => cb(prisma));
    prisma.$queryRaw = jest.fn();
    await expect(new PermissionService(prisma).createDocumentShare(2, 'u1', {
      roleKey: 'editor',
      canView: true,
    } as any)).rejects.toThrow('usuarios');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects mapped role permission expansion', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: 'admin' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 9, isActive: true }) },
      documentPermission: { create },
    };

    prisma.$transaction = jest.fn(async cb => cb(prisma));
    prisma.$queryRaw = jest.fn();
    await expect(new PermissionService(prisma).grantDocumentPermission(2, 'u1', {
      role: 'admin',
      canView: true,
    } as any)).rejects.toThrow('usuarios');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects catalog-only role permission expansion', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma: any = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', role: 'admin' }) },
      role: { findUnique: jest.fn().mockResolvedValue({ id: 10, isActive: true }) },
      documentPermission: { create },
    };

    prisma.$transaction = jest.fn(async cb => cb(prisma));
    prisma.$queryRaw = jest.fn();
    await expect(new PermissionService(prisma).grantDocumentPermission(2, 'u1', {
      roleKey: 'editor',
      canView: true,
    } as any)).rejects.toThrow('usuarios');
    expect(create).not.toHaveBeenCalled();
  });
});
