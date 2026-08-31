import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../auth/role.enum';
import { DirectoryService } from './directory.service';

describe('DirectoryService', () => {
  const user = { id: 'user-1', role: UserRole.USER };
  const prisma: any = {
    $transaction: jest.fn(),
    directory: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    document: { count: jest.fn(), findMany: jest.fn() },
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
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.directory.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
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
    const admin = { id: 'admin', role: UserRole.ADMIN };
    prisma.directory.findUnique
      .mockResolvedValueOnce({ id: 1, name: 'Policies', parentId: null, createdById: user.id })
      .mockResolvedValueOnce({ id: 2, parentId: 1, createdById: 'other' })
      .mockResolvedValueOnce({ parentId: 1 });

    await expect(service.update(1, { parentId: 2 }, admin)).rejects.toThrow('ciclo');
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

  it('allows privileged users to manage directories they did not create', async () => {
    const admin = { id: 'admin', role: UserRole.ADMIN };
    const directory = { id: 9, name: 'Shared', parentId: null, createdById: 'other' };
    prisma.directory.findUnique.mockResolvedValue(directory);
    prisma.directory.update.mockResolvedValue({ ...directory, name: 'Renamed' });

    await expect(service.update(9, { name: 'Renamed' }, admin)).resolves.toMatchObject({ name: 'Renamed' });
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

    await expect(service.getNavigationSummary(user)).resolves.toEqual({
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

    await expect(service.getNavigationSummary(user)).resolves.toEqual({
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
      .mockResolvedValueOnce([{ id: 3, name: 'Alpha' }]);

    await expect(service.getAccessibleDirectories(2, 1, user)).resolves.toEqual({
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
