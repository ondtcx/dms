import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../auth/role.enum';
import { DirectoryService } from './directory.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';

describe('live reception document mutations', () => {
  const document = { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 };
  function fixture() {
    const db: any = {
      directory: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, receptionEnabled: where.id === 2, createdById: 'author' })) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'author', role: 'admin' }) },
      directoryUserParticipant: { findUnique: jest.fn().mockResolvedValue({ peerRead: true }) },
      directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      directoryDelegate: { findUnique: jest.fn().mockResolvedValue({ full: true, review: true }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new DirectoryService(db);
    return { db, guard: (actor = 'author', operation = 'edit', doc = document) =>
      (service as any).assertDocumentMutation(db, doc, actor, operation) };
  }
  it('uses durable origin first and current participation for its immutable author', async () => {
    const { db, guard } = fixture();
    await expect(guard()).resolves.toBe(true);
    expect(db.directory.findUnique).toHaveBeenCalledTimes(1);
    expect(db.directory.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(db.directoryRoleParticipant.findMany).toHaveBeenCalledWith({ where: {
      directoryId: 2, role: { isActive: true, assignments: { some: { userId: 'author' } } },
    } });
    expect(db.documentWorkflow.findFirst).not.toHaveBeenCalled();
  });
  it('rejects peers even with full operational and global privileges', async () => {
    await expect(fixture().guard('peer')).rejects.toThrow('autor');
  });
  it('rejects revoked authors despite ownership and full operational rights', async () => {
    const { db, guard } = fixture();
    db.directoryUserParticipant.findUnique.mockResolvedValue(null);
    await expect(guard()).rejects.toThrow('participación');
  });
  it('accepts live catalog participants and rejects missing identities', async () => {
    const { db, guard } = fixture();
    db.directoryUserParticipant.findUnique.mockResolvedValue(null);
    db.directoryRoleParticipant.findMany.mockResolvedValue([{ peerRead: false }]);
    await expect(guard()).resolves.toBe(true);
    db.user.findUnique.mockResolvedValue(null);
    await expect(guard()).rejects.toThrow();
  });
  it.each(['DRAFT', 'PENDING', 'IN_PROGRESS', 'CHANGES_REQUESTED'])('rejects withdrawal during %s', async status => {
    const { db, guard } = fixture();
    db.documentWorkflow.findFirst.mockResolvedValue({ id: 3, status });
    await expect(guard('author', 'withdraw')).rejects.toThrow('revisión activa');
    expect(db.documentWorkflow.findFirst).toHaveBeenCalledWith({ where: {
      documentId: 1, active: true, status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] },
    }, select: { id: true } });
  });
  it('permits terminal-review withdrawal without touching quota or versions', async () => {
    await expect(fixture().guard('author', 'withdraw')).resolves.toBe(true);
  });
  it('falls back to current reception only when origin is absent', async () => {
    const { guard } = fixture();
    await expect(guard('author', 'edit', { ...document, directoryId: 2, receptionOriginDirectoryId: null } as any)).resolves.toBe(true);
    await expect(guard('peer', 'edit', { ...document, receptionOriginDirectoryId: null } as any)).resolves.toBe(false);
  });
});

describe('lifetime reception admission', () => {
  const user = { id: 'uploader', role: UserRole.ADMIN };
  let db: any;
  let service: DirectoryService;
  let receipts: any[];
  beforeEach(() => {
    receipts = [];
    db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      directory: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, createdById: where.id === 9 ? user.id : 'owner', receptionEnabled: where.id !== 9, singleDocumentPerParticipant: true })) },
      directoryUserParticipant: { findUnique: jest.fn().mockResolvedValue({ peerRead: false }) },
      directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      directoryDelegate: { findUnique: jest.fn().mockResolvedValue(null) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      receptionSubmission: {
        findUnique: jest.fn(async ({ where }) => receipts.find(r => r.directoryId === where.directoryId_documentId.directoryId && r.documentId === where.directoryId_documentId.documentId) ?? null),
        count: jest.fn(async ({ where }) => receipts.filter(r => r.directoryId === where.directoryId && r.uploadedById === where.uploadedById).length),
        create: jest.fn(async ({ data }) => { receipts.push(data); return data; }),
      },
    };
    db.$transaction = jest.fn(async cb => cb(db));
    service = new DirectoryService(db);
  });
  const prepare = (destination: number | null, document?: any) => (service as any).prepareSubmission(db, destination, user, document);
  const record = (id: number, origin = 2) => (service as any).recordSubmission(db, { id, uploadedById: user.id }, origin);

  it('locks affected folders in stable order and retains source origin on withdrawal', async () => {
    expect(await prepare(9, { id: 1, uploadedById: user.id, directoryId: 2, receptionOriginDirectoryId: 2 })).toBe(2);
    expect(db.$queryRaw.mock.calls.map(([sql]) => sql.values)).toEqual([[2], [9]]);
    expect(db.documentWorkflow.findFirst).toHaveBeenCalled();
  });
  it('makes same document reentry idempotent while blocking a second distinct document', async () => {
    await record(1);
    await record(1);
    await expect(record(2)).rejects.toThrow('cupo');
    expect(receipts).toEqual([{ directoryId: 2, documentId: 1, uploadedById: user.id }]);
  });
  it('records quota-disabled history and blocks a new identity after enabling quota', async () => {
    db.directory.findUnique.mockResolvedValue({ id: 2, receptionEnabled: true, singleDocumentPerParticipant: false });
    await record(1); await record(2);
    db.directory.findUnique.mockResolvedValue({ id: 2, receptionEnabled: true, singleDocumentPerParticipant: true });
    await record(1);
    await expect(record(3)).rejects.toThrow('cupo');
    expect(receipts).toHaveLength(2);
  });
  it.each([{ createdById: user.id }, { delegates: true }])('does not confuse operational rights with participation %j', async patch => {
    db.directoryUserParticipant.findUnique.mockResolvedValue(null);
    db.directory.findUnique.mockResolvedValue({ id: 2, receptionEnabled: true, createdById: patch.createdById ?? 'owner' });
    db.directoryDelegate.findUnique.mockResolvedValue(patch.delegates ? { full: true } : null);
    await expect(prepare(2)).rejects.toThrow('permiso');
    expect(db.receptionSubmission.create).not.toHaveBeenCalled();
  });
  it('uses only live active catalog assignments, never the caller global role', async () => {
    db.directoryUserParticipant.findUnique.mockResolvedValue(null);
    db.directoryRoleParticipant.findMany.mockResolvedValue([{ peerRead: false }]);
    expect(await prepare(2)).toBe(2);
    expect(db.directoryRoleParticipant.findMany).toHaveBeenCalledWith({ where: {
      directoryId: 2, role: { isActive: true, assignments: { some: { userId: user.id } } },
    } });
    db.directoryRoleParticipant.findMany.mockResolvedValue([]);
    await expect(prepare(2)).rejects.toThrow();
  });
  it('rejects manager admission on behalf of another immutable uploader', async () => {
    await expect(prepare(2, { id: 1, uploadedById: 'other', directoryId: null })).rejects.toThrow('autor');
  });
  it('rejects cross-reception origin reassignment', async () => {
    await expect(prepare(3, { id: 1, uploadedById: user.id, receptionOriginDirectoryId: 2, directoryId: null })).rejects.toThrow('otra recepción');
  });
  it('rejects withdrawal during an active workflow and after participant revocation', async () => {
    const doc = { id: 1, uploadedById: user.id, receptionOriginDirectoryId: 2, directoryId: 2 };
    db.documentWorkflow.findFirst.mockResolvedValue({ id: 12 });
    await expect(prepare(null, doc)).rejects.toThrow('revisión');
    db.documentWorkflow.findFirst.mockResolvedValue(null);
    db.directoryUserParticipant.findUnique.mockResolvedValue(null);
    await expect(prepare(null, doc)).rejects.toThrow();
  });
  it('maps serialization failure to a Spanish conflict without retry', async () => {
    db.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect((service as any).submissionTransaction(async () => undefined)).rejects.toThrow('Vuelve a intentarlo');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('DirectoryService', () => {
  const user = { id: 'user-1', role: UserRole.USER };
  const prisma: any = {
    $transaction: jest.fn(),
    directoryUserParticipant: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), deleteMany: jest.fn() },
    directoryDelegate: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'target' }), findMany: jest.fn() },
    role: { findFirst: jest.fn().mockResolvedValue({ id: 2 }), findMany: jest.fn() },
    directory: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    document: { count: jest.fn(), findMany: jest.fn() },
    receptionSubmission: { count: jest.fn().mockResolvedValue(0) },
    userDirectoryUsage: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    directoryNavigationEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  let service: DirectoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DirectoryService(prisma);
    prisma.$transaction.mockReset().mockImplementation(async (callback: any) => callback(prisma));
    prisma.directoryUserParticipant.findUnique.mockResolvedValue(null);
    prisma.directoryRoleParticipant.findMany.mockResolvedValue([]);
    prisma.directoryDelegate.findUnique.mockResolvedValue(null);
    prisma.directory.findUnique.mockReset();
    prisma.directory.findMany.mockReset().mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
  });

  it('uses the reception-aware document filter for discovery without exposing submission counts', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-10T12:00:00Z') });
    try {
      await service.getAccessibleDirectories(1, 50, user);
      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: { ...buildDocumentAccessFilter(user), directoryId: { not: null } },
        select: { directoryId: true },
      });
      expect(prisma.document.count).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['create', 'update', 'configure', 'remove'] as const)('keeps every %s structural read and write on the serializable transaction client', async (operation) => {
    const tx: any = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      directory: {
        findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, name: 'Folder', parentId: where.id === 1 && operation === 'configure' ? 2 : null, createdById: user.id, receptionEnabled: false })),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 3 }),
        update: jest.fn().mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true }),
        delete: jest.fn().mockResolvedValue({ id: 1 }),
      },
      document: { count: jest.fn().mockResolvedValue(0) },
      receptionSubmission: { count: jest.fn().mockResolvedValue(0) },
      directoryUserParticipant: { findUnique: jest.fn().mockResolvedValue(null) },
      directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      directoryDelegate: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const root: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const isolated = new DirectoryService(root);
    if (operation === 'create') await isolated.create({ name: 'Child', parentId: 2 }, user);
    if (operation === 'update') await isolated.update(1, { parentId: 2, name: 'Renamed' }, user);
    if (operation === 'configure') await isolated.configureReception(1, { enabled: true }, user);
    if (operation === 'remove') await isolated.remove(1, user);
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(root.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(tx.directory.findUnique).toHaveBeenCalled();
    expect(tx.directory[operation === 'configure' ? 'update' : operation === 'remove' ? 'delete' : operation]).toHaveBeenCalled();
  });

  it.each(['create', 'update', 'configure', 'remove'] as const)('fails closed on a %s serialization conflict without ignoring or retrying it', async (operation) => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    const action = operation === 'create' ? service.create({ name: 'Child' }, user)
      : operation === 'update' ? service.update(1, { name: 'Renamed' }, user)
      : operation === 'configure' ? service.configureReception(1, { enabled: true }, user)
      : service.remove(1, user);
    await expect(action).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects deletion of an empty reception with moved-out or deleted submission history', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true });
    prisma.directory.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(0);
    prisma.receptionSubmission.count.mockResolvedValueOnce(1);
    await expect(service.remove(1, user)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.count).toHaveBeenCalledWith({ where: { OR: [{ directoryId: 1 }, { receptionOriginDirectoryId: 1 }] } });
    expect(prisma.directory.delete).not.toHaveBeenCalled();
  });

  it('rejects a sequential move into an already enabled reception', async () => {
    prisma.directory.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id, createdById: user.id, name: 'Folder', parentId: null, receptionEnabled: where.id === 2,
    }));
    await expect(service.update(1, { parentId: 2 }, user)).rejects.toThrow('anidar');
    expect(prisma.directory.update).not.toHaveBeenCalled();
  });

  it('rejects institutional bypass for reception management', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: 'other', receptionEnabled: true });
    await expect(service.configureReception(1, { enabled: true }, { id: 'admin', role: UserRole.ADMIN })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a delegate self-update using the authoritative target', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true });
    await expect(service.setDelegate(1, user.id, { full: true }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects populated ordinary conversion even for its owner', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, parentId: null });
    prisma.document.count.mockResolvedValue(1);
    prisma.directory.count.mockResolvedValue(0);
    await expect(service.configureReception(1, { enabled: true }, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('converts an empty owned directory with serializable isolation', async () => {
    const directory = { id: 1, createdById: user.id, parentId: null, singleDocumentPerParticipant: true };
    prisma.directory.findUnique.mockResolvedValue(directory);
    prisma.document.count.mockResolvedValue(0);
    prisma.directory.count.mockResolvedValue(0);
    prisma.directory.update.mockResolvedValue({ ...directory, receptionEnabled: true });
    await expect(service.configureReception(1, { enabled: true, singleDocumentPerParticipant: true }, user)).resolves.toMatchObject({
      directoryId: 1, enabled: true, singleDocumentPerParticipant: true, capabilities: { owner: true, configure: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('rejects reversal and conversion with descendants', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true });
    await expect(service.configureReception(1, { enabled: false }, user)).rejects.toThrow('desactivar');
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id });
    prisma.document.count.mockResolvedValue(0);
    prisma.directory.count.mockResolvedValue(1);
    await expect(service.configureReception(1, { enabled: true }, user)).rejects.toThrow('descendientes');
  });

  it('discovers empty role-eligible reception folders using active assignment authorization', async () => {
    const directory = { id: 8, createdById: 'other', receptionEnabled: true, parentId: null };
    prisma.directory.findMany.mockImplementation(async (args: any) => args.where?.receptionEnabled === true ? [directory] : []);
    prisma.directoryRoleParticipant.findMany.mockResolvedValue([{ peerRead: true }]);
    await expect(service.getAccessibleDirectories(1, 20, user)).resolves.toMatchObject({ meta: { total: 1 } });
    expect(prisma.directoryRoleParticipant.findMany).toHaveBeenCalledWith({ where: {
      directoryId: 8, role: { isActive: true, assignments: { some: { userId: user.id } } },
    } });
  });

  it('removes reception discovery supplied by old document grants after revocation', async () => {
    prisma.document.findMany.mockResolvedValue([{ directoryId: 8 }]);
    prisma.directory.findMany.mockResolvedValue([{ id: 8, createdById: 'other', receptionEnabled: true, parentId: null }]);
    await expect(service.getAccessibleDirectories(1, 20, user)).resolves.toMatchObject({ meta: { total: 0 } });
  });

  it('allows the owner to join as a participant without changing ownership', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true });
    await service.setParticipant(1, { userId: user.id, peerRead: false }, user);
    expect(prisma.directoryUserParticipant.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { directoryId: 1, userId: user.id, peerRead: false } }));
    expect(prisma.directory.update).not.toHaveBeenCalled();
  });

  it('rejects a limited delegate granting or removing higher operational permissions', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: 'owner', receptionEnabled: true });
    prisma.directoryDelegate.findUnique.mockImplementation(async (args: any) => args.where.directoryId_userId.userId === user.id
      ? { manageDelegates: true } : { full: true });
    await expect(service.setDelegate(1, 'target', { review: true }, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setDelegate(1, 'target', {}, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeDelegate(1, 'target', user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.directoryDelegate.upsert).not.toHaveBeenCalled();
  });

  it('bounds recipient searches without institutional permissions', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: 'owner', receptionEnabled: true });
    prisma.directoryDelegate.findUnique.mockResolvedValue({ manageParticipants: true });
    prisma.user.findMany.mockResolvedValue([{ id: 'target' }]);
    await expect(service.searchRecipients(1, 'users', { q: 'ab', limit: 5 }, user)).resolves.toEqual([{ id: 'target' }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5, select: { id: true, name: true, email: true } }));
    await service.searchRecipients(1, 'roles', {}, user);
    expect(prisma.role.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, take: 20 }));
    await expect(service.searchRecipients(1, 'users', { q: 'ab', limit: 51 }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies recipient search to ordinary participants and unassigned administrators', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: 'owner', receptionEnabled: true });
    prisma.directoryUserParticipant.findUnique.mockResolvedValue({ peerRead: true });
    await expect(service.searchRecipients(1, 'roles', {}, user)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.directoryUserParticipant.findUnique.mockResolvedValue(null);
    await expect(service.searchRecipients(1, 'roles', {}, { id: 'admin', role: UserRole.ADMIN })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows full delegates to rename reception without transferring ownership', async () => {
    const directory = { id: 1, name: 'Inbox', createdById: 'owner', receptionEnabled: true, parentId: null };
    prisma.directory.findUnique.mockResolvedValue(directory);
    prisma.directoryDelegate.findUnique.mockResolvedValue({ full: true });
    prisma.directory.update.mockResolvedValue({ ...directory, name: 'Renamed' });
    await expect(service.update(1, { name: 'Renamed' }, user)).resolves.toMatchObject({ createdById: 'owner', name: 'Renamed' });
    expect(prisma.directory.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: 'Renamed', nameNormalized: 'renamed', parentId: null } });
  });

  it('denies structure changes to consultation-only delegates', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, name: 'Inbox', createdById: 'owner', receptionEnabled: true, parentId: null });
    prisma.directoryDelegate.findUnique.mockResolvedValue({ readAll: true });
    await expect(service.update(1, { name: 'Renamed' }, user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(1, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reads current capabilities and preserves explicit review access after membership loss', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: 'owner', receptionEnabled: true, singleDocumentPerParticipant: true });
    prisma.directoryDelegate.findUnique.mockResolvedValue({ review: true });
    await expect(service.getReception(1, user)).resolves.toMatchObject({ capabilities: { submit: false, readAll: true, review: true } });
    prisma.directoryDelegate.findUnique.mockResolvedValue(null);
    await expect(service.getReception(1, user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes only the authorized participant rule without deleting submissions', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true });
    await service.removeParticipant(1, 'user', 'former', user);
    expect(prisma.directoryUserParticipant.deleteMany).toHaveBeenCalledWith({ where: { directoryId: 1, userId: 'former' } });
    expect(prisma.directory.delete).not.toHaveBeenCalled();
  });

  it('rejects children inside reception and reception movement', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id, receptionEnabled: true, parentId: null });
    await expect(service.create({ name: 'Child', parentId: 1 }, user)).rejects.toThrow('anidar');
    await expect(service.update(1, { parentId: 2 }, user)).rejects.toThrow('mover');
  });

  it('rejects ownership transfer before mutation', async () => {
    await expect(service.update(1, { createdById: 'other' } as any, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.directory.update).not.toHaveBeenCalled();
  });

  it('trims names and stores a case-insensitive normalized sibling key', async () => {
    prisma.directory.create.mockResolvedValue({ id: 1, name: 'Finance' });

    await service.create({ name: '  Finance  ' }, user);

    expect(prisma.directory.create).toHaveBeenCalledWith({
      data: { name: 'Finance', nameNormalized: 'finance', parentId: null, createdById: 'user-1' },
    });
  });

  it('creates a root directory when parentId is null without validating a parent', async () => {
    const directory = { id: 1, name: 'Finance', parentId: null };
    prisma.directory.create.mockResolvedValue(directory);

    await expect(service.create({ name: 'Finance', parentId: null }, user)).resolves.toEqual(directory);

    expect(prisma.directory.findUnique).not.toHaveBeenCalled();
    expect(prisma.directory.create).toHaveBeenCalledWith({
      data: { name: 'Finance', nameNormalized: 'finance', parentId: null, createdById: 'user-1' },
    });
  });

  it('maps a normalized sibling database conflict to 409', async () => {
    prisma.directory.create.mockRejectedValue({
      code: 'P2002',
      constructor: { name: 'PrismaClientKnownRequestError' },
    });

    await expect(service.create({ name: ' finance ' }, user)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects whitespace-only directory names', async () => {
    await expect(service.create({ name: '   ' }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.directory.create).not.toHaveBeenCalled();
  });

  it('rejects a reparenting cycle', async () => {
    prisma.directory.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, name: 'Policies',
      parentId: where.id === 2 ? 1 : null, createdById: user.id }));
    await expect(service.update(1, { parentId: 2 }, user)).rejects.toThrow('ciclo');
  });

  it('conceals an unrelated directory from management', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 9, createdById: 'other', parentId: null });

    await expect(service.update(9, { name: 'Hidden' }, user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies management to a discoverable non-owner', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 9, createdById: 'other', parentId: null });
    prisma.document.findMany.mockResolvedValue([{ directoryId: 9 }]);
    prisma.directory.findMany.mockResolvedValue([{ id: 9, parentId: null }]);

    await expect(service.update(9, { name: 'Nope' }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow privileged users to manage private directories they did not create', async () => {
    const admin = { id: 'admin', role: UserRole.ADMIN };
    const directory = { id: 9, name: 'Shared', parentId: null, createdById: 'other' };
    prisma.directory.findUnique.mockResolvedValue(directory);
    prisma.directory.update.mockResolvedValue({ ...directory, name: 'Renamed' });

    await expect(service.update(9, { name: 'Renamed' }, admin)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.directory.update).not.toHaveBeenCalled();
  });

  it('rejects deletion when children or documents exist', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id });
    prisma.directory.count.mockResolvedValue(1);
    prisma.document.count.mockResolvedValue(0);

    await expect(service.remove(1, user)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.directory.delete).not.toHaveBeenCalled();
  });

  it('denies a non-owner populated-directory deletion without mutation', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 9, createdById: 'other-user', parentId: null });
    prisma.document.findMany.mockResolvedValue([{ directoryId: 9 }]);
    prisma.directory.findMany.mockResolvedValue([{ id: 9, parentId: null }]);

    await expect(service.remove(9, user)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.directory.count).not.toHaveBeenCalled();
    expect(prisma.document.count).not.toHaveBeenCalled();
    expect(prisma.directory.delete).not.toHaveBeenCalled();
  });

  it('deletes only an empty owned directory', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 1, createdById: user.id });
    prisma.directory.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(0);
    prisma.directory.delete.mockResolvedValue({ id: 1 });

    await expect(service.remove(1, user)).resolves.toEqual({ id: 1 });
    expect(prisma.directory.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('returns a breadcrumb from the discoverable directory to the root', async () => {
    prisma.directory.findUnique
      .mockResolvedValueOnce({ id: 3, name: 'Annual', parentId: 2, createdById: user.id })
      .mockResolvedValueOnce({ id: 3, name: 'Annual', parentId: 2 })
      .mockResolvedValueOnce({ id: 2, name: 'Policies', parentId: null });

    await expect(service.getBreadcrumb(3, user)).resolves.toEqual([
      { id: 2, name: 'Policies', parentId: null },
      { id: 3, name: 'Annual', parentId: 2 },
    ]);
  });

  it('records an authorized navigation atomically and increments usage', async () => {
    prisma.directory.findUnique.mockResolvedValue({ id: 3, createdById: user.id, parentId: null });
    prisma.directoryNavigationEvent.findUnique.mockResolvedValue(null);
    prisma.directoryNavigationEvent.create.mockResolvedValue({ id: 1 });
    prisma.userDirectoryUsage.upsert.mockResolvedValue({ directoryId: 3, accessCount: 1 });

    await service.recordVisit(3, 'event-1', user);

    expect(prisma.directoryNavigationEvent.create).toHaveBeenCalledWith({
      data: { userId: user.id, directoryId: 3, eventId: 'event-1' },
    });
    expect(prisma.userDirectoryUsage.upsert).toHaveBeenCalledWith({
      where: { userId_directoryId: { userId: user.id, directoryId: 3 } },
      create: { userId: user.id, directoryId: 3, accessCount: 1 },
      update: { accessCount: { increment: 1 }, lastAccessedAt: expect.anything() },
    });
  });

  it('does not increment usage when the same navigation event is retried', async () => {
    prisma.directoryNavigationEvent.findUnique.mockResolvedValue({ directoryId: 3 });
    prisma.directory.findUnique.mockResolvedValue({ id: 3, createdById: user.id, parentId: null });

    await service.recordVisit(3, 'event-1', user);

    expect(prisma.directoryNavigationEvent.create).not.toHaveBeenCalled();
    expect(prisma.userDirectoryUsage.upsert).not.toHaveBeenCalled();
  });

  it('rejects reusing an event for another directory', async () => {
    prisma.directoryNavigationEvent.findUnique.mockResolvedValue({ directoryId: 8 });

    await expect(service.recordVisit(3, 'event-1', user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.userDirectoryUsage.upsert).not.toHaveBeenCalled();
  });

  it('conceals undiscoverable visits without writing usage or events', async () => {
    prisma.directoryNavigationEvent.findUnique.mockResolvedValue(null);
    prisma.directory.findUnique.mockResolvedValue({ id: 3, createdById: 'other-user', parentId: null });
    prisma.document.findMany.mockResolvedValue([]);

    await expect(service.recordVisit(3, 'event-1', user)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.directoryNavigationEvent.create).not.toHaveBeenCalled();
    expect(prisma.userDirectoryUsage.upsert).not.toHaveBeenCalled();
  });

  it('returns independently ranked, discoverable summary lists', async () => {
    const directory = { id: 3, name: 'Visible', parentId: null, createdById: user.id };
    prisma.directory.findUnique.mockResolvedValue(directory);
    prisma.directory.findMany.mockResolvedValue([directory]);
    prisma.userDirectoryUsage.findMany
      .mockResolvedValueOnce([{ directory }])
      .mockResolvedValueOnce([{ directory }]);

    await expect(service.getNavigationSummary(user)).resolves.toMatchObject({
      recent: [directory],
      mostUsed: [directory],
    });
    expect(prisma.userDirectoryUsage.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { userId: user.id, directoryId: { in: [3] } },
      take: 5,
    }));
  });

  it('revalidates saved usage and removes a directory that is no longer discoverable', async () => {
    const directory = { id: 3, name: 'Visible', parentId: null, createdById: 'other-user' };
    prisma.document.findMany
      .mockResolvedValueOnce([{ directoryId: 3 }])
      .mockResolvedValueOnce([]);
    prisma.directory.findMany
      .mockResolvedValueOnce([{ id: 3, parentId: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.userDirectoryUsage.findMany.mockResolvedValue([{ directory }]);

    await expect(service.getNavigationSummary(user)).resolves.toMatchObject({
      recent: [directory],
      mostUsed: [directory],
    });
    await expect(service.getNavigationSummary(user)).resolves.toEqual({ recent: [], mostUsed: [] });
    expect(prisma.userDirectoryUsage.findMany).toHaveBeenCalledTimes(2);
  });

  it('isolates navigation events and usage counts between users while deduplicating retries', async () => {
    const adminOne = { id: 'user-1', role: UserRole.ADMIN };
    const adminTwo = { id: 'user-2', role: UserRole.ADMIN };
    const events = new Map<string, { directoryId: number }>();
    prisma.directory.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.directory.findUnique.mockResolvedValue({ id: 3, createdById: 'owner', parentId: null });
    prisma.directoryNavigationEvent.findUnique.mockImplementation(({ where }: any) =>
      events.get(`${where.userId_eventId.userId}:${where.userId_eventId.eventId}`) ?? null,
    );
    prisma.directoryNavigationEvent.create.mockImplementation(async ({ data }: any) => {
      events.set(`${data.userId}:${data.eventId}`, { directoryId: data.directoryId });
      return { id: events.size };
    });

    await service.recordVisit(3, 'event-1', adminOne);
    await service.recordVisit(3, 'event-1', adminTwo);
    await service.recordVisit(3, 'event-1', adminOne);

    expect(prisma.directoryNavigationEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.userDirectoryUsage.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.userDirectoryUsage.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { userId_directoryId: { userId: 'user-1', directoryId: 3 } },
    }));
    expect(prisma.userDirectoryUsage.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { userId_directoryId: { userId: 'user-2', directoryId: 3 } },
    }));
  });

  it('paginates accessible directories with deterministic ordering', async () => {
    prisma.document.findMany.mockResolvedValue([{ directoryId: 3 }, { directoryId: 4 }]);
    prisma.directory.findMany
      .mockResolvedValueOnce([{ id: 3, parentId: null }, { id: 4, parentId: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3, name: 'Alpha' }]);

    await expect(service.getAccessibleDirectories(2, 1, user)).resolves.toMatchObject({
      data: [{ id: 3, name: 'Alpha' }],
      meta: { page: 2, limit: 1, total: 2, totalPages: 2 },
    });
    expect(prisma.directory.findMany).toHaveBeenLastCalledWith({
      where: { id: { in: [3, 4] } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 1,
      take: 1,
    });
  });

  it('rejects invalid accessible-directory pagination', async () => {
    await expect(service.getAccessibleDirectories(0, 50, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getAccessibleDirectories(1, 101, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});

// T5a: el alcance de recepción de un documento concreto se resuelve con el
// cliente indicado, manda el origen durable y falla cerrado ante origen roto o
// identidad eliminada. Las lecturas exigen acceso vigente vía el filtro compartido.
describe('document reception scope', () => {
  function scopeFixture() {
    const db: any = {
      directory: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, receptionEnabled: where.id === 2, createdById: 'author' })) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'author', role: 'admin' }) },
      directoryUserParticipant: { findUnique: jest.fn().mockResolvedValue(null) },
      directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      directoryDelegate: { findUnique: jest.fn().mockResolvedValue(null) },
      document: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const service = new DirectoryService(db);
    const resolve = (doc: any, actor = 'author') => (service as any).resolveDocumentReceptionScope(db, doc, actor);
    return { db, service, resolve };
  }

  it('treats an ordinary document as non-reception without a user lookup', async () => {
    const { db, resolve } = scopeFixture();
    await expect(resolve({ id: 1, uploadedById: 'author', directoryId: null, receptionOriginDirectoryId: null }))
      .resolves.toMatchObject({ reception: false, capabilities: null });
    expect(db.directory.findUnique).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('resolves the durable origin first and keeps the current reception open', async () => {
    const { db, resolve } = scopeFixture();
    await expect(resolve({ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 }))
      .resolves.toMatchObject({ reception: true, directoryId: 2 });
    expect(db.directory.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
    // Una carpeta ordinaria (origen nulo) no activa el alcance de recepción.
    db.directory.findUnique.mockResolvedValue({ id: 9, receptionEnabled: false, createdById: 'author' });
    await expect(resolve({ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null }, 'other'))
      .resolves.toMatchObject({ reception: false });
  });

  it('fails closed on a broken origin and on a deleted or revoked identity', async () => {
    const { db, resolve } = scopeFixture();
    db.directory.findUnique.mockResolvedValue({ id: 2, receptionEnabled: false, createdById: 'author' });
    await expect(resolve({ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 }))
      .rejects.toThrow('origen');

    db.directory.findUnique.mockResolvedValue({ id: 2, receptionEnabled: true, createdById: 'author' });
    db.user.findUnique.mockResolvedValue(null);
    await expect(resolve({ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 }))
      .rejects.toThrow('participación');
  });

  it('requires current read access for reception reads through the shared document filter', async () => {
    const { db, service } = scopeFixture();
    const scope = { reception: true, directoryId: 2, actorId: 'author', actorRole: UserRole.ADMIN };
    db.document.findFirst.mockResolvedValueOnce(null);
    await expect((service as any).assertReceptionRead(db, 1, scope)).rejects.toThrow('acceso');
    const where = db.document.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe(1);
    expect(where.OR).toBeDefined();

    db.document.findFirst.mockResolvedValueOnce({ id: 1 });
    await expect((service as any).assertReceptionRead(db, 1, scope)).resolves.toBeUndefined();
    // Un alcance ordinario no consulta el filtro de lectura.
    db.document.findFirst.mockClear();
    await expect((service as any).assertReceptionRead(db, 1, { reception: false })).resolves.toBeUndefined();
    expect(db.document.findFirst).not.toHaveBeenCalled();
  });
});
describe('ordinary folder sharing management', () => {
  function fixture() {
    const folder = { id: 10, createdById: 'owner', name: 'Private', parentId: null, receptionEnabled: false, isPublic: false };
    const db: any = {
      notification: { create: jest.fn() },
      directory: { findUnique: jest.fn().mockResolvedValue(folder), update: jest.fn(async ({ data }) => ({ ...folder, ...data })) },
      user: { findUnique: jest.fn(async ({ where }) => ({ id: where.id })), findMany: jest.fn().mockResolvedValue([{ id: 'owner', name: 'Owner' }]) },
      directoryAncestor: { findMany: jest.fn().mockResolvedValue([{ ancestorId: 10, descendantId: 10, depth: 0, ancestor: folder }]) },
      effectiveAccessGrant: { findMany: jest.fn().mockResolvedValue([]) },
      accessGrant: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 7, ...data })),
        findUnique: jest.fn().mockResolvedValue({ id: 7, directoryId: 10, userId: 'recipient', grantedById: 'owner' }), update: jest.fn() },
      $queryRaw: jest.fn(),
    };
    db.$transaction = jest.fn(cb => cb(db));
    return { folder, db, service: new DirectoryService(db) };
  }
  const owner = { id: 'owner', role: UserRole.USER };
  const delegate = { id: 'delegate', role: UserRole.ADMIN };
  it('creates named granular grants under a Serializable folder lock, with authenticated-public owner control', async () => {
    const { db, service } = fixture();
    await expect(service.grantSharing(10, { userId: 'recipient', canEdit: true, canUploadVersion: true, canShare: true }, owner)).resolves.toMatchObject({
      directoryId: 10, grantedById: 'owner', parentGrantId: null, canView: true, canEdit: true, canUploadVersion: true, canShare: true,
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.accessGrant.create.mock.invocationCallOrder[0]);
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'recipient', title: 'Carpeta compartida contigo' }) });
    await expect(service.setVisibility(10, { isPublic: true }, owner)).resolves.toMatchObject({ isPublic: true });
  });
  it('lets a bounded delegate grant only its own rights and cannot revoke owner grants or set public visibility', async () => {
    const { db, service } = fixture();
    const source = { id: 7, directoryId: 10, userId: 'delegate', grantedById: 'owner', canView: true, canEdit: false, canUploadVersion: true, canShare: true };
    db.effectiveAccessGrant.findMany.mockResolvedValue([source]);
    await expect(service.grantSharing(10, { userId: 'recipient', canUploadVersion: true }, delegate)).resolves.toMatchObject({ parentGrantId: 7, grantedById: 'delegate' });
    await expect(service.grantSharing(10, { userId: 'recipient', canEdit: true }, delegate)).rejects.toThrow();
    await expect(service.revokeSharing(10, 7, delegate)).rejects.toThrow('otros usuarios');
    await expect(service.setVisibility(10, { isPublic: true }, delegate)).rejects.toThrow('propietario');
    expect(db.directory.update).not.toHaveBeenCalled();
  });
  it('rechecks grant revocation after locking rather than trusting earlier discovery', async () => {
    const { db, service } = fixture();
    db.$queryRaw.mockImplementation(async () => { db.effectiveAccessGrant.findMany.mockResolvedValue([]); });
    await expect(service.grantSharing(10, { userId: 'recipient' }, delegate)).rejects.toThrow();
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
  it('rejects reception sharing and public visibility even for its owner', async () => {
    const { folder, db, service } = fixture();
    folder.receptionEnabled = true;
    await expect(service.grantSharing(10, { userId: 'recipient' }, owner)).rejects.toThrow('recepción');
    await expect(service.setVisibility(10, { isPublic: true }, owner)).rejects.toThrow('recepción');
    expect(db.accessGrant.create).not.toHaveBeenCalled();
    expect(db.directory.update).not.toHaveBeenCalled();
  });
  it('rejects role expansion and deletion flags instead of silently granting them', async () => {
    const { service, db } = fixture();
    for (const data of [{ userId: 'recipient', role: 'admin' }, { userId: 'recipient', canDelete: true }]) {
      await expect(service.grantSharing(10, data as any, owner)).rejects.toThrow('inválida');
    }
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
});
describe('ordinary navigation sharing summary readback', () => {
  it('adds outgoing owner sharing to children, accessible and ranked navigation without recipient identities', async () => {
    const folder = { id: 10, createdById: 'owner', name: 'Shared folder', parentId: null, receptionEnabled: false, isPublic: false };
    const db: any = {
      directory: { findMany: jest.fn(async ({ where }) => where.receptionEnabled === true ? [] : [folder]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      directoryAncestor: { findMany: jest.fn(async ({ include }) => include
        ? [{ ancestorId: 10, descendantId: 10, depth: 0, ancestor: folder }] : [{ ancestorId: 10 }]) },
      effectiveAccessGrant: { findMany: jest.fn(async ({ where }) => typeof where.userId === 'string' ? []
        : [{ directoryId: 10, documentId: null, userId: 'private-recipient' }]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userDirectoryUsage: { findMany: jest.fn().mockResolvedValue([{ directory: folder }]) },
    };
    const service = new DirectoryService(db);
    const owner = { id: 'owner', role: UserRole.USER };
    const children = await service.findChildren(undefined, owner);
    const accessible = await service.getAccessibleDirectories(1, 50, owner);
    const ranked = await service.getNavigationSummary(owner);
    for (const row of [...children, ...accessible.data, ...ranked.recent, ...ranked.mostUsed]) {
      expect(row.sharingSummary).toEqual({ shared: true, direct: true, inherited: false, public: false });
      expect(row.sharingProvenance).toEqual([]);
      expect(row.capabilities.owner).toBe(true);
      expect(JSON.stringify(row)).not.toContain('private-recipient');
    }
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
