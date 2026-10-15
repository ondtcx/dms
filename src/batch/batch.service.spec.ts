import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '../auth/role.enum';
import { DirectoryService } from '../directory/directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { BatchService } from './batch.service';

jest.mock('archiver', () => {
  const createArchive = () => ({
    pipe: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
  });
  const factory: any = jest.fn(createArchive);
  return { __esModule: true, default: factory };
});

import archiver from 'archiver';

interface DirectorySeed { id: number; receptionEnabled: boolean; createdById: string }
interface ParticipantSeed { directoryId: number; userId: string; peerRead?: boolean }

interface HarnessConfig {
  documents: {
    id: number;
    uploadedById: string;
    directoryId: number | null;
    receptionOriginDirectoryId: number | null;
    deletedAt?: Date | null;
  }[];
  directories?: DirectorySeed[];
  users?: { id: string; role: string }[];
  participants?: ParticipantSeed[];
  roleParticipants?: ParticipantSeed[];
  permissions?: { documentId: number; userId: string; canEdit?: boolean; canDelete?: boolean; canView?: boolean }[];
  workflows?: { documentId: number; active: boolean; status: string; initiatedById?: string }[];
  receptionReadable?: number[];
}

async function harness(config: HarnessConfig) {
  const documents = new Map<number, any>();
  for (const doc of config.documents) {
    documents.set(doc.id, {
      id: doc.id,
      uploadedById: doc.uploadedById,
      directoryId: doc.directoryId,
      receptionOriginDirectoryId: doc.receptionOriginDirectoryId,
      deletedAt: doc.deletedAt ?? null,
      versions: [{ filename: `doc-${doc.id}.pdf`, path: `uploads/doc-${doc.id}.pdf` }],
    });
  }
  const directories = new Map((config.directories ?? []).map(d => [d.id, d]));
  const users = new Map((config.users ?? []).map(u => [u.id, u]));
  const participants = new Map((config.participants ?? []).map(p => [`${p.directoryId}:${p.userId}`, { peerRead: p.peerRead ?? false }]));
  const roleParticipants = config.roleParticipants ?? [];
  const permissions = config.permissions ?? [];
  const workflows = config.workflows ?? [];
  const receptionReadable = new Set(config.receptionReadable ?? []);

  const prisma: any = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    document: {
      findMany: jest.fn(async ({ where }: any) => {
        const ids: number[] = where?.id?.in ?? [];
        let list = [...new Set(ids)].map(id => documents.get(id)).filter((doc: any) => Boolean(doc));
        if (where?.deletedAt && 'not' in where.deletedAt) list = list.filter((doc: any) => doc.deletedAt != null);
        return list.map((doc: any) => ({ ...doc }));
      }),
      findFirst: jest.fn(async ({ where }: any) =>
        where?.id != null && receptionReadable.has(where.id) ? { id: where.id } : null),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const unique = [...new Set<number>(where.id.in)];
        let count = 0;
        for (const id of unique) {
          const doc = documents.get(id);
          if (!doc) continue;
          if ('deletedAt' in data) doc.deletedAt = data.deletedAt;
          count += 1;
        }
        return { count };
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        let count = 0;
        for (const id of new Set<number>(where.id.in)) if (documents.delete(id)) count += 1;
        return { count };
      }),
    },
    documentPermission: {
      findFirst: jest.fn(async ({ where }: any) =>
        permissions.find(p =>
          p.documentId === where.documentId &&
          (where.OR?.[0]?.userId === undefined || p.userId === where.OR[0].userId) &&
          (where.canEdit === undefined || p.canEdit === true) &&
          (where.canDelete === undefined || p.canDelete === true) &&
          (where.canView === undefined || p.canView === true)) ?? null),
    },
    documentWorkflow: {
      findFirst: jest.fn(async ({ where }: any) =>
        workflows.find(w =>
          w.documentId === where.documentId &&
          (where.active === undefined || w.active === where.active) &&
          (where.status?.notIn ? !where.status.notIn.includes(w.status) : true) &&
          (where.status?.in ? where.status.in.includes(w.status) : true)) ?? null),
    },
    directory: {
      findUnique: jest.fn(async ({ where }: any) => directories.get(where.id) ?? null),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
    },
    directoryUserParticipant: {
      findUnique: jest.fn(async ({ where }: any) =>
        participants.get(`${where.directoryId_userId.directoryId}:${where.directoryId_userId.userId}`) ?? null),
    },
    directoryRoleParticipant: {
      findMany: jest.fn(async ({ where }: any) =>
        roleParticipants
          .filter(r => r.directoryId === where.directoryId && r.userId === where.role.assignments.some.userId)
          .map(r => ({ peerRead: r.peerRead ?? false }))),
    },
    directoryDelegate: {
      findUnique: jest.fn(async () => null),
    },
  };

  const directory = new DirectoryService(prisma);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BatchService,
      { provide: PrismaService, useValue: prisma },
      { provide: DirectoryService, useValue: directory },
    ],
  }).compile();

  const res = { setHeader: jest.fn() } as any;
  const snapshot = () => JSON.stringify([...documents.entries()]);
  return { batch: moduleRef.get(BatchService), prisma, res, snapshot };
}

const ORDINARY_DIRECTORY: DirectorySeed = { id: 9, receptionEnabled: false, createdById: 'author' };
const RECEPTION_DIRECTORY: DirectorySeed = { id: 2, receptionEnabled: true, createdById: 'mgr' };
const USERS = [
  { id: 'author', role: 'estudiante' },
  { id: 'peer', role: 'estudiante' },
  { id: 'stranger', role: 'estudiante' },
  { id: 'admin', role: UserRole.ADMIN },
];

beforeEach(() => {
  (archiver as unknown as jest.Mock).mockClear();
});

describe('BatchService.batchUpdate reception and ordinary policy', () => {
  it('updates every requested ordinary document for its owner and preserves the payload', async () => {
    const { batch, prisma } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null }],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchUpdate(
      { documentIds: [1], categoryId: 5, courseId: 6, subjectId: 7, description: 'x' },
      'author',
    )).resolves.toEqual({ success: true, updated: 1, documentIds: [1] });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      data: { categoryId: 5, courseId: 6, subjectId: 7, description: 'x' },
    });
  });

  it('honours an ordinary direct canEdit grant and rejects a missing one', async () => {
    const { batch } = await harness({
      documents: [
        { id: 2, uploadedById: 'other', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 3, uploadedById: 'other', directoryId: 9, receptionOriginDirectoryId: null },
      ],
      directories: [ORDINARY_DIRECTORY],
      permissions: [{ documentId: 2, userId: 'author', canEdit: true }],
    });
    await expect(batch.batchUpdate({ documentIds: [2] }, 'author'))
      .resolves.toEqual({ success: true, updated: 1, documentIds: [2] });
    await expect(batch.batchUpdate({ documentIds: [3] }, 'author')).rejects.toThrow(ForbiddenException);
  });

  it('allows a live reception author even from a durable origin over an ordinary directory', async () => {
    const { batch } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
    });
    await expect(batch.batchUpdate({ documentIds: [4], description: 'y' }, 'author'))
      .resolves.toEqual({ success: true, updated: 1, documentIds: [4] });
  });

  it('rejects a revoked reception author and leaves the batch untouched', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
    });
    const before = snapshot();
    await expect(batch.batchUpdate({ documentIds: [4], description: 'y' }, 'author')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('rejects a peer or a direct-granted non-author on a reception document', async () => {
    const { batch } = await harness({
      documents: [{ id: 5, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      permissions: [{ documentId: 5, userId: 'peer', canEdit: true }],
    });
    await expect(batch.batchUpdate({ documentIds: [5] }, 'peer')).rejects.toThrow(ForbiddenException);
  });

  it('does not let a global ADMIN bypass reception participation', async () => {
    const { batch } = await harness({
      documents: [{ id: 6, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
    });
    await expect(batch.batchUpdate({ documentIds: [6] }, 'admin')).rejects.toThrow(ForbiddenException);
  });

  it('keeps the legacy duplicate and missing-id outcomes and ID ordering', async () => {
    const { batch } = await harness({
      documents: [
        { id: 7, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 8, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
      ],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchUpdate({ documentIds: [7, 7] }, 'author')).rejects.toThrow(NotFoundException);
    await expect(batch.batchUpdate({ documentIds: [7, 999] }, 'author')).rejects.toThrow(NotFoundException);
    await expect(batch.batchUpdate({ documentIds: [8, 7] }, 'author'))
      .resolves.toEqual({ success: true, updated: 2, documentIds: [8, 7] });
  });
});

describe('BatchService.batchUpdate reception metadata review policy', () => {
  const receptionDoc = { id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 };

  it.each(['PENDING', 'IN_PROGRESS'])('rejects a live reception author metadata update during %s review', async status => {
    const { batch, prisma, snapshot } = await harness({
      documents: [{ ...receptionDoc }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status, initiatedById: 'author' }],
    });
    const before = snapshot();
    await expect(batch.batchUpdate({ documentIds: [4], description: 'x' }, 'author')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
    expect(prisma.documentWorkflow.findFirst).toHaveBeenCalled();
  });

  it('allows a CHANGES_REQUESTED reception author to update metadata', async () => {
    const { batch } = await harness({
      documents: [{ ...receptionDoc }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status: 'CHANGES_REQUESTED', initiatedById: 'author' }],
    });
    await expect(batch.batchUpdate({ documentIds: [4], description: 'x' }, 'author'))
      .resolves.toEqual({ success: true, updated: 1, documentIds: [4] });
  });

  it('rejects CHANGES_REQUESTED when another actor initiated the review', async () => {
    const { batch, snapshot } = await harness({
      documents: [{ ...receptionDoc }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status: 'CHANGES_REQUESTED', initiatedById: 'other' }],
    });
    const before = snapshot();
    await expect(batch.batchUpdate({ documentIds: [4], description: 'x' }, 'author')).rejects.toThrow(ForbiddenException);
    expect(snapshot()).toBe(before);
  });

  it('does not let an ADMIN-role reception author bypass the review lock', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [{ id: 4, uploadedById: 'adminauthor', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: [...USERS, { id: 'adminauthor', role: UserRole.ADMIN }],
      participants: [{ directoryId: 2, userId: 'adminauthor' }],
      workflows: [{ documentId: 4, active: true, status: 'PENDING', initiatedById: 'adminauthor' }],
    });
    const before = snapshot();
    await expect(batch.batchUpdate({ documentIds: [4], description: 'x' }, 'adminauthor')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('rejects a mixed ordinary+reception lot with an active reception review before any write', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [
        { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
        { ...receptionDoc },
      ],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status: 'IN_PROGRESS', initiatedById: 'author' }],
    });
    const before = snapshot();
    await expect(batch.batchUpdate({ documentIds: [1, 4], description: 'x' }, 'author')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('rejects a durable-origin reception target under active review', async () => {
    const { batch } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status: 'PENDING', initiatedById: 'author' }],
    });
    await expect(batch.batchUpdate({ documentIds: [4], description: 'x' }, 'author')).rejects.toThrow(ForbiddenException);
  });

  it('keeps the ordinary active-review batch baseline allowed with no workflow restriction', async () => {
    const { batch, prisma } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null }],
      directories: [ORDINARY_DIRECTORY],
      workflows: [{ documentId: 1, active: true, status: 'PENDING', initiatedById: 'author' }],
    });
    await expect(batch.batchUpdate({ documentIds: [1], description: 'x' }, 'author'))
      .resolves.toEqual({ success: true, updated: 1, documentIds: [1] });
    expect(prisma.documentWorkflow.findFirst).not.toHaveBeenCalled();
  });
});

describe('BatchService.batchDelete reception permanent and trash policy', () => {
  it('soft-deletes an ordinary owned document preserving the counters and payload', async () => {
    const { batch, prisma } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null }],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchDelete({ documentIds: [1] }, 'author'))
      .resolves.toEqual({ success: true, deleted: 1, permanent: false, documentIds: [1] });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      data: { deletedAt: expect.any(Date), deletedById: 'author' },
    });
  });

  it('soft-deletes a live reception author but blocks a revoked one', async () => {
    const seeded = {
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
    };
    const live = await harness({ ...seeded, participants: [{ directoryId: 2, userId: 'author' }] });
    await expect(live.batch.batchDelete({ documentIds: [4] }, 'author'))
      .resolves.toEqual({ success: true, deleted: 1, permanent: false, documentIds: [4] });

    const revoked = await harness(seeded);
    await expect(revoked.batch.batchDelete({ documentIds: [4] }, 'author')).rejects.toThrow(ForbiddenException);
    expect(revoked.prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('blocks trashing a reception document with an active review', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status: 'PENDING' }],
    });
    const before = snapshot();
    await expect(batch.batchDelete({ documentIds: [4] }, 'author')).rejects.toThrow(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('permanently deletes an ordinary owned document without an ADMIN-only policy', async () => {
    const { batch, prisma } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null }],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchDelete({ documentIds: [1], permanent: true }, 'author'))
      .resolves.toEqual({ success: true, deleted: 1, permanent: true, documentIds: [1] });
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } });
  });

  it('rejects permanent deletion of a reception origin even for its live author', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
    });
    const before = snapshot();
    await expect(batch.batchDelete({ documentIds: [4], permanent: true }, 'author')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('rejects a mixed ordinary + reception permanent lot as a whole', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [
        { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 },
      ],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
    });
    const before = snapshot();
    await expect(batch.batchDelete({ documentIds: [1, 4], permanent: true }, 'author')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.deleteMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('does not let an ADMIN with share/direct flags bypass the reception rejection', async () => {
    const { batch } = await harness({
      documents: [{ id: 6, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      permissions: [{ documentId: 6, userId: 'admin', canDelete: true }],
    });
    await expect(batch.batchDelete({ documentIds: [6], permanent: true }, 'admin')).rejects.toThrow(ForbiddenException);
  });
});

describe('BatchService.batchRestore mixed and review policy', () => {
  it('restores an ordinary deleted document and preserves missing-id tolerance', async () => {
    const { batch, prisma } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null, deletedAt: new Date() }],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchRestore([1, 999], 'author'))
      .resolves.toEqual({ success: true, restored: 1, documentIds: [1, 999] });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 999] } },
      data: { deletedAt: null, deletedById: null },
    });
  });

  it('keeps the ordinary restore baseline allowed even under an active review', async () => {
    const { batch, prisma } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null, deletedAt: new Date() }],
      directories: [ORDINARY_DIRECTORY],
      workflows: [{ documentId: 1, active: true, status: 'PENDING', initiatedById: 'author' }],
    });
    await expect(batch.batchRestore([1], 'author'))
      .resolves.toEqual({ success: true, restored: 1, documentIds: [1] });
    expect(prisma.documentWorkflow.findFirst).not.toHaveBeenCalled();
  });

  it('restores a deleted live reception author without an active review', async () => {
    const { batch } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2, deletedAt: new Date() }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
    });
    await expect(batch.batchRestore([4], 'author'))
      .resolves.toEqual({ success: true, restored: 1, documentIds: [4] });
  });

  it('rejects a mixed restore when the reception target is not eligible, touching nothing', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [
        { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null, deletedAt: new Date() },
        { id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2, deletedAt: new Date() },
      ],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
    });
    const before = snapshot();
    await expect(batch.batchRestore([1, 4], 'author')).rejects.toThrow(ForbiddenException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('blocks restoring a reception document with an active review', async () => {
    const { batch, prisma, snapshot } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2, deletedAt: new Date() }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
      workflows: [{ documentId: 4, active: true, status: 'IN_PROGRESS' }],
    });
    const before = snapshot();
    await expect(batch.batchRestore([4], 'author')).rejects.toThrow(ConflictException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  });

  it('returns NotFound when none of the requested documents are deleted', async () => {
    const { batch } = await harness({
      documents: [{ id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null }],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchRestore([1], 'author')).rejects.toThrow(NotFoundException);
  });
});

describe('BatchService.batchExport reception read authority before streams', () => {
  it('exports for a live peer-enabled reception participant', async () => {
    const { batch, res } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'peer', peerRead: true }],
      receptionReadable: [4],
    });
    await expect(batch.batchExport({ documentIds: [4] }, 'peer', res))
      .resolves.toEqual({ success: true, exported: 1, documentIds: [4] });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(archiver).toHaveBeenCalled();
  });

  it('leaks no header or stream for a private-origin stranger', async () => {
    const { batch, res } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
    });
    await expect(batch.batchExport({ documentIds: [4] }, 'stranger', res)).rejects.toThrow(ForbiddenException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(archiver).not.toHaveBeenCalled();
  });

  it('leaks no header or stream for a global ADMIN without reception scope', async () => {
    const { batch, res } = await harness({
      documents: [{ id: 4, uploadedById: 'author', directoryId: 2, receptionOriginDirectoryId: 2 }],
      directories: [ORDINARY_DIRECTORY, RECEPTION_DIRECTORY],
      users: USERS,
      participants: [{ directoryId: 2, userId: 'author' }],
    });
    await expect(batch.batchExport({ documentIds: [4] }, 'admin', res)).rejects.toThrow(ForbiddenException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(archiver).not.toHaveBeenCalled();
  });

  it('preserves the ordinary owner and direct canView contract with partial-export tolerance', async () => {
    const { batch, res } = await harness({
      documents: [
        { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 2, uploadedById: 'other', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 3, uploadedById: 'other', directoryId: 9, receptionOriginDirectoryId: null },
      ],
      directories: [ORDINARY_DIRECTORY],
      permissions: [{ documentId: 2, userId: 'author', canView: true }],
    });
    await expect(batch.batchExport({ documentIds: [1, 2] }, 'author', res))
      .resolves.toEqual({ success: true, exported: 2, documentIds: [1, 2] });
    res.setHeader.mockClear();
    await expect(batch.batchExport({ documentIds: [3] }, 'author', res)).rejects.toThrow(ForbiddenException);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('returns NotFound when no requested document exists', async () => {
    const { batch, res } = await harness({
      documents: [],
      directories: [ORDINARY_DIRECTORY],
    });
    await expect(batch.batchExport({ documentIds: [999] }, 'author', res)).rejects.toThrow(NotFoundException);
  });
});

describe('BatchService bulk transaction, locking and DI wiring', () => {
  it('runs mutations inside a Serializable transaction with a sorted row lock', async () => {
    const { batch, prisma } = await harness({
      documents: [
        { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 2, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
        { id: 3, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: null },
      ],
      directories: [ORDINARY_DIRECTORY],
    });
    await batch.batchUpdate({ documentIds: [3, 1, 2] }, 'author');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    const lockSql: any = prisma.$queryRaw.mock.calls[0][0];
    expect(lockSql.values).toEqual([1, 2, 3]);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.document.findMany.mock.invocationCallOrder[0]);
  });

  it('handles an empty id list without emitting an invalid lock query', async () => {
    const { batch, prisma } = await harness({ documents: [], directories: [ORDINARY_DIRECTORY] });
    await expect(batch.batchUpdate({ documentIds: [] }, 'author'))
      .resolves.toEqual({ success: true, updated: 0, documentIds: [] });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('maps a serialization failure to a Spanish conflict without retrying', async () => {
    const { batch, prisma } = await harness({ documents: [], directories: [ORDINARY_DIRECTORY] });
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(batch.batchRestore([1], 'author')).rejects.toThrow('Vuelve a intentarlo');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
