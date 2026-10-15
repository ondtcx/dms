import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditResource, WorkflowStatus } from '@prisma/client';
import { DocumentService } from './document.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentNumberingService } from './document-numbering.service';
import { DirectoryService } from '../directory/directory.service';
import { TextExtractionService } from './text-extraction/text-extraction.service';
import { PdfOcrService } from './text-extraction/pdf-ocr.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UserRole } from '../auth/role.enum';
import * as fs from 'fs';

jest.mock('uuid', () => ({ v4: () => '1234-5678' }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFile: jest.fn(),
}));

describe('reception mutation entrypoints', () => {
  function fixture(actor = 'peer', participant = true) {
    const version = { id: 10, version: 1, filename: 'a.txt', storedName: 'a.txt', path: '/archive/a.txt', mimetype: 'text/plain' };
    const document = { id: 1, uploadedById: 'author', directoryId: 9, receptionOriginDirectoryId: 2,
      currentVersion: 1, categoryId: null, isPublic: false, deletedAt: null, versions: [version] };
    const db: any = {
      $queryRaw: jest.fn(),
      document: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn().mockResolvedValue(document), delete: jest.fn() },
      documentVersion: { findUnique: jest.fn().mockResolvedValue(version), findMany: jest.fn().mockResolvedValue([version]),
        update: jest.fn(async ({ data }) => ({ ...version, ...data })), create: jest.fn(async ({ data }) => ({ id: 11, ...data })) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: actor, role: 'admin' }) },
      directory: { findUnique: jest.fn().mockResolvedValue({ id: 2, createdById: actor, receptionEnabled: true }) },
      directoryUserParticipant: { findUnique: jest.fn().mockResolvedValue(participant ? { peerRead: true } : null) },
      directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      directoryDelegate: { findUnique: jest.fn().mockResolvedValue({ full: true }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      workflowApproval: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
      documentAccess: { create: jest.fn() },
    };
    db.$transaction = jest.fn(async cb => cb(db));
    const storage: any = Object.fromEntries(['generateStructuredPath', 'copyFile', 'moveFile', 'moveToTrash', 'restoreFromTrash', 'deleteFile', 'calculateFileHash', 'fileExists'].map(key => [key, jest.fn()]));
    storage.generateStructuredPath.mockReturnValue({ path: '/new/a.txt' });
    storage.moveToTrash.mockReturnValue('/trash/a.txt');
    storage.fileExists.mockReturnValue(true);
    const thumbnail: any = { deleteThumbnail: jest.fn(), regenerateThumbnail: jest.fn().mockResolvedValue(undefined) };
    const service = new DocumentService(db, storage, { getVersionRetentionDays: jest.fn().mockResolvedValue(30) } as any,
      thumbnail, {} as any, new DirectoryService(db), { extractFromFile: jest.fn() } as any, { enqueue: jest.fn() } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(document as any);
    return { db, service, storage, document, thumbnail };
  }
  const operations = ['update', 'replaceFile', 'saveTextContent', 'restoreVersion', 'updateVersionRetention',
    'remove', 'restore', 'permanentDelete', 'restoreFromArchive'] as const;
  function mutate(service: DocumentService, operation: typeof operations[number], actor: string, role = UserRole.ADMIN) {
    switch (operation) {
      case 'update': return service.update(1, { description: 'Cambio' }, actor, role);
      case 'replaceFile': return service.replaceFile(1, { path: '/incoming/a.txt', originalname: 'a.txt', mimetype: 'text/plain', size: 2 } as any, actor, role);
      case 'saveTextContent': return service.saveTextContent(1, 'Cambio', actor, role);
      case 'restoreVersion': return service.restoreVersion(1, 1, actor, role);
      case 'updateVersionRetention': return service.updateVersionRetention(1, 1, { mode: 'permanent' }, actor, role);
      case 'remove': return service.remove(1, actor, role);
      case 'restore': return service.restore(1, actor, role);
      case 'permanentDelete': return service.permanentDelete(1, actor, role);
      case 'restoreFromArchive': return service.restoreFromArchive(1, actor, role);
    }
  }
  it.each(operations)('denies peer ADMIN %s before any file or persistence effects', async operation => {
    const { service, db, storage, thumbnail, document } = fixture();
    if (operation === 'restore') document.deletedAt = new Date() as any;
    await expect(mutate(service, operation, 'peer')).rejects.toThrow('autor');
    for (const mock of Object.values(storage)) expect(mock).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.document.delete).not.toHaveBeenCalled();
    expect(db.documentVersion.update).not.toHaveBeenCalled();
    expect(db.documentVersion.create).not.toHaveBeenCalled();
    expect(thumbnail.deleteThumbnail).not.toHaveBeenCalled();
  });
  it.each(operations)('denies revoked uploader %s despite stale readable snapshots', async operation => {
    const { service, db, storage, document } = fixture('author', false);
    if (operation === 'restore') document.deletedAt = new Date() as any;
    await expect(mutate(service, operation, 'author')).rejects.toThrow('participación');
    for (const mock of Object.values(storage)) expect(mock).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.documentVersion.update).not.toHaveBeenCalled();
  });
  it('suppresses edit and retention capabilities for peers and revoked authors', async () => {
    for (const [actor, participant] of [['peer', true], ['author', false]] as const) {
      const { service, document } = fixture(actor, participant);
      await expect(service.canEditDocument(document, actor, UserRole.ADMIN)).resolves.toBe(false);
      const history = await service.getVersions(1, actor, UserRole.ADMIN);
      expect(history[0].canManageRetention).toBe(false);
    }
  });

  it('reads exclusively through the provided transaction client when one is supplied', async () => {
    const root: any = {
      document: {
        findUnique: jest
          .fn()
          .mockRejectedValue(new Error('root document connection used')),
      },
      documentWorkflow: {
        findFirst: jest
          .fn()
          .mockRejectedValue(new Error('root workflow connection used')),
      },
      workflowApproval: {
        findFirst: jest
          .fn()
          .mockRejectedValue(new Error('root approval connection used')),
      },
    };
    const tx: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'approver' }) },
      document: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1, uploadedById: 'author', deletedAt: null }),
      },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      workflowApproval: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
    };
    const directoryService: any = {
      assertDocumentMutation: jest.fn().mockResolvedValue(false),
    };
    const service = new DocumentService(
      root,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      directoryService,
      {} as any,
      {} as any,
    );

    await expect(
      service.canEditDocument(
        { id: 1, uploadedById: 'author' },
        'approver',
        UserRole.USER,
        tx,
      ),
    ).resolves.toBe(true);
    expect(directoryService.assertDocumentMutation).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 1 }),
      'approver',
      'edit',
    );
    expect(tx.document.findUnique).toHaveBeenCalled();
    expect(tx.documentWorkflow.findFirst).toHaveBeenCalled();
    expect(tx.workflowApproval.findFirst).toHaveBeenCalled();
    expect(root.document.findUnique).not.toHaveBeenCalled();
    expect(root.documentWorkflow.findFirst).not.toHaveBeenCalled();
    expect(root.workflowApproval.findFirst).not.toHaveBeenCalled();
  });
  it.each(operations)('allows currently participating author %s without global privileges', async operation => {
    const { service, document, db } = fixture('author');
    if (operation === 'restore') document.deletedAt = new Date() as any;
    await expect(mutate(service, operation, 'author', UserRole.USER)).resolves.toBeDefined();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
  it.each(operations)('rechecks revocation after preflight and before %s file effects', async operation => {
    const { service, document, db, storage } = fixture('author');
    if (operation === 'restore') document.deletedAt = new Date() as any;
    db.$queryRaw.mockImplementation(async () => { db.directoryUserParticipant.findUnique.mockResolvedValue(null); });
    await expect(mutate(service, operation, 'author')).rejects.toThrow('participación');
    for (const mock of Object.values(storage)) expect(mock).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.document.delete).not.toHaveBeenCalled();
    expect(db.documentVersion.update).not.toHaveBeenCalled();
  });
  it.each(['remove', 'restore', 'permanentDelete', 'restoreFromArchive'] as const)
    ('blocks author %s while any nonterminal review is active', async operation => {
      const { service, db, document, storage } = fixture('author');
      if (operation === 'restore') document.deletedAt = new Date() as any;
      db.documentWorkflow.findFirst.mockResolvedValue({ id: 3, status: 'DRAFT' });
      await expect(mutate(service, operation, 'author')).rejects.toThrow('revisión activa');
      for (const mock of Object.values(storage)) expect(mock).not.toHaveBeenCalled();
    });
  it.each(['update', 'replaceFile', 'saveTextContent'] as const)('retains workflow correction constraints for author ADMIN %s', async operation => {
    const { service, db, storage } = fixture('author');
    db.documentWorkflow.findFirst.mockResolvedValue({ id: 3, status: 'PENDING', initiatedById: 'author' });
    await expect(mutate(service, operation, 'author')).rejects.toThrow('workflow activo');
    expect(storage.copyFile).not.toHaveBeenCalled();
    db.documentWorkflow.findFirst.mockResolvedValue({ id: 3, status: 'CHANGES_REQUESTED', initiatedById: 'author' });
    await expect(mutate(service, operation, 'author')).resolves.toBeDefined();
  });
  it.each(['replaceFile', 'saveTextContent', 'restoreVersion', 'remove', 'restore', 'restoreFromArchive'] as const)
    ('compensates only new %s bytes on persistence failure', async operation => {
      const { service, db, document, storage } = fixture('author');
      if (operation === 'restore') document.deletedAt = new Date() as any;
      db.document.update.mockRejectedValue(new Error('write failed'));
      await expect(mutate(service, operation, 'author')).rejects.toThrow('write failed');
      expect(storage.deleteFile).toHaveBeenCalledTimes(1);
      expect(storage.deleteFile).not.toHaveBeenCalledWith('/archive/a.txt');
      expect(storage.deleteFile).not.toHaveBeenCalledWith('/incoming/a.txt');
      if (operation !== 'remove') expect(storage.deleteFile).toHaveBeenCalledWith('/new/a.txt');
    });
  it('never deletes permanent-deletion bytes or thumbnails when commit fails', async () => {
    const { service, db, storage, thumbnail } = fixture('author');
    db.$transaction.mockImplementation(async cb => { await cb(db); throw new Error('commit failed'); });
    await expect(service.permanentDelete(1, 'author', UserRole.USER)).rejects.toThrow('commit failed');
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(thumbnail.deleteThumbnail).not.toHaveBeenCalled();
  });
  it('does not compensate committed content when thumbnail work fails', async () => {
    const { service, storage, thumbnail } = fixture('author');
    thumbnail.regenerateThumbnail.mockRejectedValue(new Error('thumbnail failed'));
    await expect(service.replaceFile(1, { path: '/incoming/a.txt', originalname: 'a.txt', mimetype: 'text/plain', size: 2 } as any, 'author', UserRole.USER)).resolves.toBeDefined();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('preserves historical aliases when trashing the current version', async () => {
    const { service, document, storage } = fixture('author');
    document.versions.push({ ...document.versions[0], id: 9, version: 0 });
    await service.remove(1, 'author', UserRole.USER);
    expect(storage.deleteFile).not.toHaveBeenCalledWith('/archive/a.txt');
  });
  it('allows only the ordinary resource owner to permanently delete regardless of role', async () => {
    const { service, document, storage } = fixture('author');
    document.receptionOriginDirectoryId = null as any;
    document.directoryId = null as any;
    await expect(service.permanentDelete(1, 'admin', UserRole.ADMIN)).rejects.toThrow('propietario');
    expect(storage.deleteFile).not.toHaveBeenCalled();
    await expect(service.permanentDelete(1, 'author', UserRole.USER)).resolves.toBeDefined();
  });
  it('rechecks revocation after the document lock before metadata persistence', async () => {
    const { service, db } = fixture('author');
    db.$queryRaw.mockImplementation(async () => { db.directoryUserParticipant.findUnique.mockResolvedValue(null); });
    await expect(service.update(1, { isPublic: false }, 'author', UserRole.ADMIN)).rejects.toThrow('participación');
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
});

describe('version retention API', () => {
  const now = new Date();
  const version = { id: 10, documentId: 1, version: 1, supersededAt: now, retentionGraceUntil: null, preservePermanently: false, preserveUntil: null, workflowId: null, approvals: [], workflowExecutions: [], workflowTransitions: [] };
  let service: DocumentService;
  let prisma: any;
  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn(async ({ where }) => ({ id: where.id })) },
      document: { findUnique: jest.fn().mockResolvedValue({ id: 1, uploadedById: 'owner', currentVersion: 2, deletedAt: null }) },
      documentVersion: { findUnique: jest.fn().mockResolvedValue(version), findMany: jest.fn().mockResolvedValue([version]), update: jest.fn(async ({ data }) => ({ ...version, ...data })) },
      documentAccess: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (cb) => cb(prisma));
    service = new DocumentService(prisma, {} as any, { getVersionRetentionDays: jest.fn().mockResolvedValue(30) } as any, {} as any, {} as any, new DirectoryService(prisma), {} as any, {} as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', currentVersion: 2, deletedAt: null } as any);
  });
  const update = (userId = 'owner', role = UserRole.USER, body = { mode: 'permanent' }) => (service as any).updateVersionRetention(1, 1, body, userId, role);
  it.each([['owner', UserRole.USER], ['owner', UserRole.ADMIN]])('allows owner with role %s and returns computed metadata with audit', async (id, role) => {
    const result = await update(id, role);
    expect(result).toEqual(expect.objectContaining({ preservePermanently: true, preserveUntil: null, expiresAt: null, canManageRetention: true, isRetentionProtected: false }));
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.documentAccess.create).toHaveBeenCalledWith({ data: { documentId: 1, userId: id, action: 'UPDATE' } });
  });
  it.each([['reader', UserRole.USER], ['', UserRole.ADMIN], ['admin', UserRole.ADMIN], ['rector', UserRole.RECTOR]])('rejects unauthorized %s', async (id, role) => {
    await expect(update(id, role)).rejects.toThrow();
    expect(prisma.documentVersion.update).not.toHaveBeenCalled();
  });
  it('uses existing document access authorization', async () => {
    (service.findOne as jest.Mock).mockRejectedValue(new Error('access denied'));
    await expect(update()).rejects.toThrow('access denied');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([{ deletedAt: now }, { uploadedById: 'new-owner' }])('rechecks locked document %j', async (patch) => {
    prisma.document.findUnique.mockResolvedValue({ id: 1, uploadedById: 'owner', currentVersion: 2, deletedAt: null, ...patch });
    await expect(update()).rejects.toThrow();
    expect(prisma.documentVersion.update).not.toHaveBeenCalled();
  });
  it.each([
    { mode: 'normal', preserveUntil: '2099-01-01T00:00:00Z' },
    { mode: 'permanent', preserveUntil: null },
    { mode: 'until', preserveUntil: '2020-01-01T00:00:00Z' },
    { mode: 'until', preserveUntil: 'invalid' },
  ])('rejects inconsistent preservation %j without mutation', async (body) => {
    await expect((service as any).updateVersionRetention(1, 1, body, 'owner', UserRole.USER)).rejects.toThrow();
    expect(prisma.documentVersion.update).not.toHaveBeenCalled();
    expect(prisma.documentAccess.create).not.toHaveBeenCalled();
  });
  it.each([
    [{ mode: 'normal' }, false, null],
    [{ mode: 'until', preserveUntil: '2099-01-01T00:00:00Z' }, false, new Date('2099-01-01')],
  ])('applies reset or date preservation %j', async (body, permanent, until) => {
    const result = await (service as any).updateVersionRetention(1, 1, body, 'owner', UserRole.USER);
    expect(result.preservePermanently).toBe(permanent);
    expect(result.preserveUntil).toEqual(until);
    expect(result.expiresAt).toEqual(until ?? new Date(now.getTime() + 30 * 86400000));
  });
  it('rejects a missing version', async () => {
    prisma.documentVersion.findUnique.mockResolvedValue(null);
    await expect(update()).rejects.toThrow();
    expect(prisma.documentVersion.update).not.toHaveBeenCalled();
  });
  it('rolls back preservation if audit fails', async () => {
    let persisted = { ...version };
    prisma.$transaction.mockImplementation(async (cb) => {
      const original = { ...persisted };
      try { return await cb(prisma); } catch (error) { persisted = original; throw error; }
    });
    prisma.documentVersion.update.mockImplementation(async ({ data }) => { persisted = { ...persisted, ...data }; return persisted; });
    prisma.documentAccess.create.mockRejectedValue(new Error('audit failed'));
    await expect(update()).rejects.toThrow('audit failed');
    expect(persisted.preservePermanently).toBe(false);
  });
  it('keeps history an array with evidence and permission metadata', async () => {
    prisma.documentVersion.findMany.mockResolvedValue([{ ...version, workflowTransitions: [{ id: 1 }] }]);
    const rows = await service.getVersions(1, 'reader', UserRole.USER);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toEqual(expect.objectContaining({ expiresAt: null, canManageRetention: false, isRetentionProtected: true, supersededAt: now, retentionGraceUntil: null, preserveUntil: null }));
  });
});

describe('DocumentService', () => {
  let service: DocumentService;
  let prisma: PrismaService;
  let textExtraction: TextExtractionService;
  let pdfOcr: { enqueue: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        { provide: TextExtractionService, useValue: { extractFromFile: jest.fn().mockResolvedValue(null) } },
        { provide: PdfOcrService, useValue: { enqueue: jest.fn().mockReturnValue('accepted') } },
        {
          provide: PrismaService,
          useValue: {
            category: {
              upsert: jest.fn().mockResolvedValue({
                id: 99,
                allowedRoles: [],
                requiresCourse: false,
              }),
              findUnique: jest.fn().mockResolvedValue({
                id: 99,
                allowedRoles: [],
                requiresCourse: false,
              }),
            },
            documentType: {
              findUnique: jest
                .fn()
                .mockResolvedValue({ id: 12, isActive: true, categoryId: 99 }),
              // Persisted default (`Documento general`): active and uncategorized.
              findFirst: jest
                .fn()
                .mockResolvedValue({ id: 22, isActive: true, categoryId: null }),
            },
            academicYear: {
              findFirst: jest.fn().mockResolvedValue({ id: 3 }),
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 3,
                  startDate: new Date('1900-01-01'),
                  endDate: new Date('2100-12-31'),
                },
              ]),
            },
            document: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest
                .fn()
                .mockImplementation(async ({ where }) => where.id ? service.findOne(where.id, 'user123', UserRole.USER) : { id: 1 }),
              findFirst: jest.fn().mockResolvedValue({ id: 1, versions: [{}] }),
              update: jest.fn().mockResolvedValue({ id: 1 }),
              count: jest.fn().mockResolvedValue(0),
              delete: jest.fn().mockResolvedValue({ id: 1 }),
            },
            directory: {
              findUnique: jest.fn().mockResolvedValue({ id: 7 }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            directoryUserParticipant: { findMany: jest.fn().mockResolvedValue([]) },
            directoryRoleParticipant: { findMany: jest.fn().mockResolvedValue([]) },
            directoryDelegate: { findMany: jest.fn().mockResolvedValue([]) },
            documentPermission: { findMany: jest.fn().mockResolvedValue([]) },
            $queryRaw: jest.fn().mockResolvedValue([]),
            documentVersion: {
              create: jest.fn().mockImplementation(async ({ data }) => ({ id: 11, ...data })),
              update: jest.fn().mockResolvedValue({}),
              count: jest.fn().mockResolvedValue(1),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { size: 0 } }),
            },
            documentWorkflow: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            documentAccess: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            workflowApproval: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ role: 'admin' }),
            },
          },
        },
        {
          provide: DirectoryService,
          useValue: {
            assertDocumentMutation: jest.fn((db, doc, actor, operation) => new DirectoryService(db).assertDocumentMutation(db, doc, actor, operation)),
            assertDiscoverable: jest.fn().mockResolvedValue({ id: 7 }),
            assertCanUpload: jest.fn().mockResolvedValue({ id: 7 }),
            submissionTransaction: jest.fn(async cb => (prisma as any).$transaction(cb, { isolationLevel: 'Serializable' })),
            prepareSubmission: jest.fn(async (_db, destination, user) => {
               if (destination != null) await (service as any).directoryService.assertCanUpload(destination, user);
              return null;
            }),
            recordSubmission: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StorageService,
          useValue: {
            generateStructuredPath: jest
              .fn()
              .mockReturnValue({ path: '/tmp/structured/test.pdf' }),
            moveFile: jest.fn(),
            deleteFile: jest.fn(),
            fileExists: jest.fn().mockReturnValue(true),
            calculateFileHash: jest.fn().mockResolvedValue('hash123'),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getSetting: jest.fn().mockResolvedValue({}),
            getMaxVersionsPerDocument: jest.fn().mockResolvedValue(3),
            getVersionRetentionDays: jest.fn().mockResolvedValue(30),
          },
        },
        {
          provide: ThumbnailService,
          useValue: {
            generateThumbnail: jest.fn(),
            regenerateThumbnail: jest.fn().mockResolvedValue(true),
            deleteThumbnail: jest.fn(),
          },
        },
        {
          provide: DocumentNumberingService,
          useValue: {
            generateNumber: jest.fn().mockResolvedValue('DOC-001'),
            assignNumber: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    prisma = module.get<PrismaService>(PrismaService);
    textExtraction = module.get(TextExtractionService);
    pdfOcr = module.get(PdfOcrService);
    (prisma as any).$transaction = jest.fn(async (callback) => callback({
      ...prisma,
      document: {
        ...prisma.document,
        findUnique: jest.fn(async ({ where }) => service.findOne(where.id, 'user123', UserRole.USER)),
      },
    }));
    (fs.writeFileSync as jest.Mock).mockClear();
  });

  describe('sharing visibility boundary', () => {
    it.each([UserRole.USER, UserRole.RECTOR, UserRole.COORDINADOR, UserRole.VICERRECTOR])('denies non-owner %s before public persistence', async (role) => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', isPublic: false } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'other', role });
      await expect(service.update(1, { isPublic: true }, 'other', role)).rejects.toThrow('No tienes permiso para gestionar');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it.each([[UserRole.USER, 'owner'], [UserRole.ADMIN, 'owner']])('allows public change for owner role %s', async (role, actor) => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', isPublic: false } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: actor, role });
      await service.update(1, { isPublic: true }, actor, role as UserRole);
      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isPublic: true }) }));
    });
    it.each([[UserRole.USER, 'owner'], [UserRole.ADMIN, 'owner']])('persists an actual private change for owner role %s', async (role, actor) => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', isPublic: true } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: actor, role });
      await service.update(1, { isPublic: false }, actor, role as UserRole);
      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isPublic: false }) }));
    });
    it.each([UserRole.RECTOR, UserRole.VICERRECTOR])('preserves %s edits with unchanged visibility', async (role) => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', isPublic: false } as any);
      await expect(service.update(1, { isPublic: false, description: 'Descripción' }, 'other', role)).rejects.toThrow();
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it.each([UserRole.RECTOR, UserRole.VICERRECTOR])('does not persist unchanged visibility through non-owner %s edits', async (role) => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', isPublic: false } as any);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'other', role });
      (prisma as any).effectiveAccessGrant = { findMany: jest.fn().mockResolvedValue([{ id: 1, documentId: 1, userId: 'other', grantedById: 'owner', canView: true, canEdit: true }]) };
      (prisma.user as any).findMany = jest.fn().mockResolvedValue([{ id: 'owner' }]);
      await service.update(1, { isPublic: false, description: 'Descripción' }, 'other', role);
      const calls = (prisma.document.update as jest.Mock).mock.calls;
      const data = calls[calls.length - 1][0].data;
      expect('isPublic' in data).toBe(false);
      expect(data.description).toBe('Descripción');
    });
    it.each([[UserRole.USER, 'owner', true], [UserRole.ADMIN, 'other', false], [UserRole.RECTOR, 'other', false], [UserRole.COORDINADOR, 'other', false], [UserRole.VICERRECTOR, 'other', false]])('derives list/detail manager capability for %s', async (role, actor, expected) => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: actor, role });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([{ id: 1, uploadedById: 'owner' }, { id: 2, uploadedById: 'owner' }]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 1, uploadedById: 'owner' });
      const result = await service.findAll({}, actor as string, role as UserRole);
      expect(result.data.map((document) => document.canManageSharing)).toEqual([expected, expected]);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      const detail = await service.findOne(1, actor as string, role as UserRole);
      expect(detail.canManageSharing).toBe(expected);
    });
  });

  describe('immutable save history', () => {
    const current = { id: 10, version: 4, path: '/historical/current.txt', storedName: 'current.txt', filename: 'notes.txt', mimetype: 'text/plain', size: 3 };
    const selected = { ...current, id: 9, version: 2, path: '/historical/selected.txt' };
    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', categoryId: 99, currentVersion: 4, createdAt: new Date(), versions: [current] } as any);
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1, uploadedById: 'owner', categoryId: 99, currentVersion: 7, versions: [current] });
      (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
      (prisma as any).$transaction = jest.fn(async (callback) => callback(prisma));
      (prisma.documentVersion as any).findUnique = jest.fn().mockResolvedValue(selected);
      (service as any).storage.copyFile = jest.fn();
      (service as any).storage.generateVersionPath = jest.fn().mockReturnValue({ path: '/snapshot' });
    });
    async function save(flow: string) {
      if (flow === 'editor') return service.saveTextContent(1, 'new bytes', 'owner', UserRole.USER);
      if (flow === 'restore') return service.restoreVersion(1, 2, 'owner', UserRole.USER);
      return service.replaceFile(1, { originalname: 'new.txt', mimetype: 'text/plain', path: '/incoming', size: 9 } as any, 'owner', UserRole.USER);
    }
    it.each(['editor', 'replacement', 'restore'])('%s keeps outgoing paths immutable and numbers under the lock', async (flow) => {
      await save(flow);
      expect((service as any).storage.deleteFile).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(current.path, expect.anything());
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 8, path: '/tmp/structured/test.pdf' }) });
      expect((prisma as any).$queryRaw).toHaveBeenCalled();
      expect((prisma as any).$queryRaw.mock.invocationCallOrder[0]).toBeLessThan((prisma.document.findUnique as jest.Mock).mock.invocationCallOrder.slice(-1)[0]);
      expect((prisma.document.findUnique as jest.Mock).mock.invocationCallOrder.slice(-1)[0]).toBeLessThan((prisma.documentVersion.create as jest.Mock).mock.invocationCallOrder[0]);
      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentVersion: 8 }) }));
      if (flow === 'restore') {
        expect((service as any).storage.copyFile).toHaveBeenCalledWith(selected.path, '/tmp/structured/test.pdf');
        expect(selected.path).toBe('/historical/selected.txt');
      }
    });
    it.each(['editor', 'replacement', 'restore'])('%s records supersession without count pruning', async (flow) => {
      (prisma.documentVersion as any).update = jest.fn();
      (prisma.documentVersion.count as jest.Mock).mockResolvedValue(1000);
      await save(flow);
      expect((prisma.documentVersion as any).update).toHaveBeenCalledWith({ where: { id: current.id }, data: { supersededAt: expect.any(Date) } });
      expect(prisma.documentVersion.count).not.toHaveBeenCalled();
      expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
    });
    it.each(['editor', 'replacement', 'restore'])('%s database failure never deletes historical content', async (flow) => {
      (prisma.documentVersion.create as jest.Mock).mockRejectedValue(new Error('database unavailable'));
      await expect(save(flow)).rejects.toThrow('database unavailable');
      expect((service as any).storage.deleteFile).not.toHaveBeenCalledWith(current.path);
      expect((service as any).storage.deleteFile).not.toHaveBeenCalledWith(selected.path);
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(current.path, expect.anything());
    });
    it.each(['editor', 'replacement', 'restore'])('%s preparation failure leaves every historical blob intact', async (flow) => {
      if (flow === 'editor') (fs.writeFileSync as jest.Mock).mockImplementationOnce(() => { throw new Error('disk unavailable'); });
      else (service as any).storage.copyFile.mockImplementationOnce(() => { throw new Error('disk unavailable'); });
      await expect(save(flow)).rejects.toThrow('disk unavailable');
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/test.pdf');
      expect((service as any).storage.deleteFile).not.toHaveBeenCalledWith(current.path);
      expect((service as any).storage.deleteFile).not.toHaveBeenCalledWith(selected.path);
    });
    it.each(['editor', 'replacement', 'restore'])('%s rejects an outgoing-path collision before writing', async (flow) => {
      (service as any).storage.generateStructuredPath.mockReturnValue({ path: '/historical/../historical/current.txt' });
      await expect(save(flow)).rejects.toThrow('La ruta de destino ya está en uso');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect((service as any).storage.copyFile).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it('does not delete an incoming replacement that already references history', async () => {
      await service.replaceFile(1, { originalname: 'old.txt', mimetype: 'text/plain', path: current.path, size: 3 } as any, 'owner', UserRole.USER);
      expect((service as any).storage.copyFile).toHaveBeenCalledWith(current.path, '/tmp/structured/test.pdf');
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect((service as any).storage.deleteFile).not.toHaveBeenCalled();
    });
    it('ignores legacy count limits and preserves shared history paths', async () => {
      (prisma.documentVersion.count as jest.Mock).mockResolvedValue(5);
      (prisma.documentVersion.findMany as jest.Mock).mockResolvedValue([{ id: 9, path: selected.path }]);
      await save('replacement');
      expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
      expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
      expect((service as any).storage.deleteFile).not.toHaveBeenCalled();
    });
    it.each(['editor', 'replacement', 'restore'])('%s writes only through the transaction client', async (flow) => {
      const tx = {
        ...prisma,
        document: { ...prisma.document, update: jest.fn().mockResolvedValue({ id: 1, currentVersion: 8 }) },
        documentVersion: { ...prisma.documentVersion, create: jest.fn().mockImplementation(async ({ data }) => ({ id: 11, ...data })) },
        documentAccess: { create: jest.fn() },
      };
      (prisma as any).$transaction.mockImplementation(async (callback) => callback(tx));
      await save(flow);
      expect(tx.document.update).toHaveBeenCalled();
      expect(tx.documentVersion.create).toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
    });
    it('does not regenerate thumbnails when the transaction rejects', async () => {
      (prisma.documentAccess.create as jest.Mock).mockRejectedValue(new Error('audit unavailable'));
      await expect(save('replacement')).rejects.toThrow('audit unavailable');
      expect((service as any).thumbnailService.regenerateThumbnail).not.toHaveBeenCalled();
    });
  });

  describe('server-owned content indexing', () => {
    const file = { originalname: 'test.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path: '/incoming', size: 10 } as any;
    const metadata = { description: 'Agenda', documentTypeId: 12 };
    const extractor = () => textExtraction.extractFromFile as jest.Mock;
    const storage = () => (service as any).storage;
    const lastData = () => (prisma.document.update as jest.Mock).mock.calls.at(-1)[0].data;
    function editable() {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', categoryId: 99, currentVersion: 2, createdAt: new Date(), versions: [{ path: '/current', storedName: 'current.txt', mimetype: 'text/html', filename: 'current.html' }] } as any);
      storage().copyFile = jest.fn();
      storage().generateVersionPath = jest.fn().mockReturnValue({ path: '/history' });
    }
    it('extracts finalized upload bytes and persists only server text', async () => {
      extractor().mockResolvedValue('server text');
      await service.upload(file, metadata, 'owner');
      expect(extractor()).toHaveBeenCalledWith('/tmp/structured/test.pdf', file.mimetype);
      expect((prisma.document.create as jest.Mock).mock.calls[0][0].data.search).toEqual({ create: { extractedText: 'server text' } });
      expect(storage().moveFile.mock.invocationCallOrder[0]).toBeLessThan(extractor().mock.invocationCallOrder[0]);
    });
    it('rejects caller search before moving uploads and batches', async () => {
      const forged = { ...metadata, search: { extractedText: 'forged' } };
      await expect(service.upload(file, forged as any, 'owner')).rejects.toThrow();
      await expect(service.uploadMultiple([file], { metadata: [forged] } as any, 'owner')).rejects.toThrow();
      expect(storage().moveFile).not.toHaveBeenCalled();
    });
    it('indexes each finalized batch destination including null', async () => {
      storage().generateStructuredPath.mockReturnValueOnce({ path: '/first' }).mockReturnValueOnce({ path: '/second' });
      extractor().mockResolvedValueOnce('first').mockResolvedValueOnce(null);
      await service.uploadMultiple([file, { ...file, mimetype: 'image/png' }], { metadata: [metadata, metadata] } as any, 'owner');
      expect(extractor().mock.calls).toEqual([['/first', file.mimetype], ['/second', 'image/png']]);
      expect((prisma.document.create as jest.Mock).mock.calls.map(([arg]) => arg.data.search)).toEqual([{ create: { extractedText: 'first' } }, { create: { extractedText: null } }]);
    });
    it('degrades unexpected extractor rejection without logging content', async () => {
      extractor().mockRejectedValue(new Error('secret contents'));
      const log = jest.spyOn(console, 'error').mockImplementation();
      try {
        await service.upload(file, metadata, 'owner');
        expect((prisma.document.create as jest.Mock).mock.calls[0][0].data.search).toEqual({ create: { extractedText: null } });
        expect(log).not.toHaveBeenCalled();
      } finally { log.mockRestore(); }
    });
    it.each(['replacement text', null])('refreshes replacement search in the document write (%s)', async (text) => {
      editable(); extractor().mockResolvedValue(text);
      await service.replaceFile(1, file, 'owner', UserRole.USER);
      expect(extractor()).toHaveBeenCalledWith('/tmp/structured/test.pdf', file.mimetype);
      expect(lastData().search).toEqual({ upsert: { create: { extractedText: text }, update: { extractedText: text } } });
    });
    it.each(['stripped HTML', null])('indexes saved editor bytes rather than raw content (%s)', async (text) => {
      editable(); extractor().mockResolvedValue(text);
      await service.saveTextContent(1, '<p>HTML</p>', 'owner', UserRole.USER);
      expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/structured/test.pdf', Buffer.from('<p>HTML</p>'), { flag: 'wx' });
      expect(extractor()).toHaveBeenCalledWith('/tmp/structured/test.pdf', 'text/html');
      expect(lastData().search).toEqual({ upsert: { create: { extractedText: text }, update: { extractedText: text } } });
    });
    it.each(['restored text', null])('extracts the copied selected version using selected MIME (%s)', async (text) => {
      editable(); extractor().mockResolvedValue(text);
      (prisma.documentVersion as any).findUnique = jest.fn().mockResolvedValue({ path: '/selected', storedName: 'selected.docx', mimetype: file.mimetype, checksumSHA256: 'selected-hash' });
      await service.restoreVersion(1, 1, 'owner', UserRole.USER);
      expect(storage().copyFile).toHaveBeenCalledWith('/selected', '/tmp/structured/test.pdf');
      expect(extractor()).toHaveBeenCalledWith('/tmp/structured/test.pdf', file.mimetype);
      expect(storage().deleteFile).not.toHaveBeenCalledWith('/selected');
      expect(lastData().search).toEqual({ upsert: { create: { extractedText: text }, update: { extractedText: text } } });
    });
    it('does not write forged search through direct metadata update', async () => {
      editable();
      await service.update(1, { search: { extractedText: 'forged' } } as any, 'owner', UserRole.USER);
      expect(lastData()).not.toHaveProperty('search');
      expect(extractor()).not.toHaveBeenCalled();
    });
  });

  describe('background OCR enrichment hooks', () => {
    const current = { id: 10, version: 2, path: '/current.pdf', storedName: 'current.pdf', filename: 'current.pdf', mimetype: 'application/pdf', size: 10, checksumSHA256: 'c'.repeat(64) };
    const createdVersionId = 111;
    const digitalText = 'Texto digital';
    const incoming = (mimetype = 'application/pdf') => (
      { originalname: mimetype === 'application/pdf' ? 'scan.pdf' : 'notes.txt', mimetype, path: '/incoming', size: 10 } as any
    );

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'owner', categoryId: 99, currentVersion: 2, createdAt: new Date(), versions: [current] } as any);
      (prisma as any).$queryRaw = jest.fn().mockResolvedValue([]);
      (prisma as any).$transaction = jest.fn(async (callback: any) => callback(prisma));
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({ id: 1, uploadedById: 'owner', categoryId: 99, currentVersion: 2, deletedAt: null, versions: [current] });
      (prisma.document.update as jest.Mock).mockResolvedValue({ id: 1, currentVersion: 3, checksumSHA256: 'd'.repeat(64), search: { extractedText: digitalText } });
      (prisma.documentVersion as any).create = jest.fn(async ({ data }: any) => ({ id: createdVersionId, ...data }));
      (prisma.documentVersion as any).findUnique = jest.fn().mockResolvedValue({ ...current, id: 9, version: 2 });
      (prisma.documentVersion as any).update = jest.fn().mockResolvedValue({});
      (prisma.documentAccess as any).create = jest.fn();
      const storage = (service as any).storage;
      storage.copyFile = jest.fn();
      storage.calculateFileHash = jest.fn().mockResolvedValue('d'.repeat(64));
      storage.generateStructuredPath = jest.fn().mockReturnValue({ path: '/new/current.pdf' });
      storage.fileExists = jest.fn().mockReturnValue(true);
      textExtraction.extractFromFile = jest.fn().mockResolvedValue(digitalText);
      pdfOcr.enqueue.mockReset().mockReturnValue('accepted');
    });

    it('enqueues OCR for the committed replacement as the new current version', async () => {
      await service.replaceFile(1, incoming(), 'owner', UserRole.USER);
      expect(pdfOcr.enqueue).toHaveBeenCalledTimes(1);
      expect(pdfOcr.enqueue).toHaveBeenCalledWith({
        documentId: 1,
        currentVersion: 3,
        versionRowId: createdVersionId,
        checksumSHA256: 'd'.repeat(64),
        path: '/new/current.pdf',
        mimetype: 'application/pdf',
        digitalText,
      });
    });

    it('enqueues OCR for the restored version as the new current version', async () => {
      await service.restoreVersion(1, 2, 'owner', UserRole.USER);
      expect(pdfOcr.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        documentId: 1,
        currentVersion: 3,
        versionRowId: createdVersionId,
        checksumSHA256: current.checksumSHA256,
        path: '/new/current.pdf',
        mimetype: 'application/pdf',
      }));
    });

    it('does not enqueue when the version transaction rolls back', async () => {
      (prisma.documentVersion as any).create = jest.fn().mockRejectedValue(new Error('write failed'));
      await expect(service.replaceFile(1, incoming(), 'owner', UserRole.USER)).rejects.toThrow('write failed');
      expect(pdfOcr.enqueue).not.toHaveBeenCalled();
    });

    it('preserves the committed response when OCR admission throws', async () => {
      pdfOcr.enqueue.mockImplementation(() => { throw new Error('queue unavailable'); });
      await expect(service.replaceFile(1, incoming(), 'owner', UserRole.USER)).resolves.toBeDefined();
      expect((service as any).storage.deleteFile).not.toHaveBeenCalled();
    });

    it('enqueues OCR for the committed single upload destination', async () => {
      (prisma.document.create as jest.Mock).mockResolvedValue({
        id: 5,
        currentVersion: 1,
        checksumSHA256: 'a'.repeat(64),
        search: { extractedText: digitalText },
        versions: [{ id: 55, version: 1, checksumSHA256: 'a'.repeat(64), path: '/tmp/structured/test.pdf', mimetype: 'application/pdf' }],
      });
      const result = await service.upload(incoming(), { description: 'Agenda', documentTypeId: 12 }, 'owner');
      expect(result.id).toBe(5);
      expect(pdfOcr.enqueue).toHaveBeenCalledWith({
        documentId: 5,
        currentVersion: 1,
        versionRowId: 55,
        checksumSHA256: 'a'.repeat(64),
        path: '/tmp/structured/test.pdf',
        mimetype: 'application/pdf',
        digitalText,
      });
    });

    it('enqueues one OCR job per committed batch upload', async () => {
      (prisma.document.create as jest.Mock)
        .mockResolvedValueOnce({ id: 1, currentVersion: 1, checksumSHA256: 'a'.repeat(64), search: { extractedText: 'uno' }, versions: [{ id: 11, version: 1, checksumSHA256: 'a'.repeat(64), path: '/tmp/structured/test.pdf', mimetype: 'application/pdf' }] })
        .mockResolvedValueOnce({ id: 2, currentVersion: 1, checksumSHA256: 'b'.repeat(64), search: { extractedText: 'dos' }, versions: [{ id: 22, version: 1, checksumSHA256: 'b'.repeat(64), path: '/tmp/structured/test.pdf', mimetype: 'application/pdf' }] });
      await service.uploadMultiple([incoming(), incoming()], { metadata: [{ description: 'Agenda', documentTypeId: 12 }, { description: 'Agenda', documentTypeId: 12 }] } as any, 'owner');
      expect(pdfOcr.enqueue.mock.calls.map(([job]) => job.documentId)).toEqual([1, 2]);
    });

    it('delegates non-PDF mutations to the admission gate without failing the response', async () => {
      await expect(service.replaceFile(1, incoming('text/plain'), 'owner', UserRole.USER)).resolves.toBeDefined();
      expect(pdfOcr.enqueue).toHaveBeenCalledWith(expect.objectContaining({ mimetype: 'text/plain' }));
    });
  });

  describe('atomic submission persistence', () => {
    const file = { originalname: 'a.txt', path: '/staged/a.txt', mimetype: 'text/plain', size: 10 } as Express.Multer.File;
    const metadata = { description: 'Agenda', documentTypeId: 12 };
    const reception = () => {
      let receipts: any[] = [];
      let documents: any[] = [];
      let sequence = 0;
      const db = prisma as any;
      const folder = { id: 7, createdById: 'owner', receptionEnabled: true, singleDocumentPerParticipant: true };
      db.directory.findUnique.mockResolvedValue(folder);
      db.directoryUserParticipant = { findUnique: jest.fn().mockResolvedValue({ peerRead: false }) };
      db.directoryRoleParticipant = { findMany: jest.fn().mockResolvedValue([]) };
      db.directoryDelegate = { findUnique: jest.fn().mockResolvedValue(null) };
      db.receptionSubmission = {
        findUnique: jest.fn(async ({ where }) => receipts.find(r => r.directoryId === where.directoryId_documentId.directoryId && r.documentId === where.directoryId_documentId.documentId) ?? null),
        count: jest.fn(async ({ where }) => receipts.filter(r => r.directoryId === where.directoryId && (!where.uploadedById || r.uploadedById === where.uploadedById)).length),
        create: jest.fn(async ({ data }) => { receipts.push(data); return data; }),
      };
      db.document.create.mockImplementation(async ({ data }) => {
        const doc = { ...data, id: ++sequence, versions: [{ path: `/blob/${sequence}` }] };
        documents.push(doc); return doc;
      });
      db.document.findUnique.mockImplementation(async ({ where }) => documents.find(d => d.id === where.id) ?? null);
      db.document.update.mockImplementation(async ({ where, data }) => {
        const doc = documents.find(d => d.id === where.id); Object.assign(doc, data); return doc;
      });
      db.$transaction.mockImplementation(async cb => {
        const originalReceipts = [...receipts];
        const originalDocuments = documents.map(d => ({ ...d }));
        try { return await cb(db); }
        catch (error) { receipts = originalReceipts; documents = originalDocuments; throw error; }
      });
      (service as any).directoryService = new DirectoryService(db);
      (service as any).storage.generateStructuredPath.mockImplementation(() => ({ path: `/prepared/${++sequence}` }));
      return { db, folder, receipts: () => receipts, documents: () => documents };
    };

    it('atomically rejects two distinct submissions for a single slot without orphan receipts or files', async () => {
      const state = reception();
      await expect(service.uploadMultiple([file, file], { directoryId: 7, metadata: [metadata, metadata] }, 'user123')).rejects.toThrow('cupo');
      expect(state.receipts()).toEqual([]);
      expect(state.documents()).toEqual([]);
      expect(state.db.receptionSubmission.create).toHaveBeenCalledTimes(1);
      expect((service as any).storage.deleteFile.mock.calls).toEqual([['/prepared/1'], ['/prepared/2']]);
      expect((service as any).thumbnailService.regenerateThumbnail).not.toHaveBeenCalled();
      expect((service as any).numberingService.assignNumber).not.toHaveBeenCalled();
      expect(state.db.$transaction).toHaveBeenCalledTimes(1);
      expect((textExtraction.extractFromFile as jest.Mock).mock.invocationCallOrder[1]).toBeLessThan(state.db.$queryRaw.mock.invocationCallOrder[0]);
    });
    it('persists uploader-attributed history with quota off, then blocks distinct documents after enabling quota', async () => {
      const state = reception();
      state.folder.singleDocumentPerParticipant = false;
      await service.uploadMultiple([file, file], { directoryId: 7, metadata: [metadata, metadata] }, 'user123');
      expect(state.receipts()).toHaveLength(2);
      expect(state.receipts().every(r => r.uploadedById === 'user123')).toBe(true);
      state.folder.singleDocumentPerParticipant = true;
      await expect(service.upload(file, { ...metadata, directoryId: 7 }, 'user123')).rejects.toThrow('cupo');
      expect(state.receipts()).toHaveLength(2);
      expect(state.documents()).toHaveLength(2);
    });
    it('withdraws and reenters the same document without removing origin privacy or consuming another slot', async () => {
      const state = reception();
      const doc = await service.upload(file, { ...metadata, directoryId: 7 }, 'user123');
      jest.spyOn(service, 'findOne').mockImplementation(async id => state.documents().find(d => d.id === id));
      await service.move(doc.id, { directoryId: null }, 'user123', UserRole.USER);
      expect(state.documents()[0]).toMatchObject({ directoryId: null, receptionOriginDirectoryId: 7 });
      await service.move(doc.id, 7, 'user123', UserRole.USER);
      expect(state.receipts()).toHaveLength(1);
      expect(state.db.receptionSubmission.create).toHaveBeenCalledTimes(1);
      expect(state.db.$queryRaw.mock.calls.some(([sql]) => sql.sql.includes('"Document"') && sql.sql.includes('FOR UPDATE'))).toBe(true);
      state.db.directoryUserParticipant.findUnique.mockResolvedValue(null);
      await expect(service.move(doc.id, { directoryId: null }, 'user123', UserRole.ADMIN)).rejects.toThrow();
      expect(state.documents()[0].directoryId).toBe(7);
      expect(state.receipts()).toHaveLength(1);
    });
    it.each(['PENDING', 'IN_PROGRESS', 'CHANGES_REQUESTED', 'DRAFT'])('denies withdrawal during an active %s workflow', async status => {
      const state = reception();
      const doc = await service.upload(file, { ...metadata, directoryId: 7 }, 'user123');
      jest.spyOn(service, 'findOne').mockResolvedValue(state.documents()[0]);
      state.db.documentWorkflow.findFirst.mockResolvedValue({ id: 10, status });
      await expect(service.move(doc.id, { directoryId: null }, 'user123', UserRole.USER)).rejects.toThrow('revisión');
      expect(state.documents()[0].directoryId).toBe(7);
      expect(state.receipts()).toHaveLength(1);
      expect(state.db.documentWorkflow.findFirst).toHaveBeenCalledWith({ where: { documentId: doc.id, active: true, status: { notIn: ['APPROVED', 'REJECTED', 'CANCELLED'] } }, select: { id: true } });
    });
    it('keeps sharing readback disabled for a physically unfiled origin-protected document', async () => {
      const doc = { id: 1, uploadedById: 'user123', directory: null, directoryId: null, receptionOriginDirectoryId: 7 };
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(doc);
      (prisma.document.findMany as jest.Mock).mockResolvedValue([doc]);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user123', role: UserRole.ADMIN });
      expect((await service.findOne(1, 'user123', UserRole.ADMIN)).canManageSharing).toBe(false);
      expect((await service.findAll({}, 'user123', UserRole.ADMIN)).data[0].canManageSharing).toBe(false);
    });
    it('rechecks live participation after preparation rather than using owner discovery as admission', async () => {
      const state = reception();
      state.folder.createdById = 'user123';
      (service as any).storage.calculateFileHash.mockImplementation(async () => {
        state.db.directoryUserParticipant.findUnique.mockResolvedValue(null);
        return 'prepared-hash';
      });
      await expect(service.upload(file, { ...metadata, directoryId: 7 }, 'user123', UserRole.ADMIN)).rejects.toThrow('permiso');
      expect(state.receipts()).toEqual([]);
      expect(state.documents()).toEqual([]);
      expect((service as any).storage.deleteFile).toHaveBeenCalled();
    });
    it('fails closed on transaction serialization conflict and compensates prepared storage', async () => {
      const state = reception();
      state.db.$transaction.mockRejectedValueOnce({ code: 'P2034' });
      await expect(service.upload(file, { ...metadata, directoryId: 7 }, 'user123')).rejects.toThrow('Vuelve a intentarlo');
      expect(state.receipts()).toEqual([]);
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/prepared/1');
    });

    it('rolls back the entire batch before post-commit work and compensates every prepared blob', async () => {
      const storage = (service as any).storage;
      storage.generateStructuredPath.mockReturnValueOnce({ path: '/first' }).mockReturnValueOnce({ path: '/second' });
      const durable: number[] = [];
      (prisma as any).$transaction.mockImplementation(async cb => {
        const pending: number[] = [];
        const tx = { ...prisma, document: { ...prisma.document, create: jest.fn(async () => {
          if (pending.length) throw new Error('second admission failed');
          pending.push(1); return { id: 1 };
        }) } };
        const result = await cb(tx);
        durable.push(...pending);
        return result;
      });
      await expect(service.uploadMultiple([file, file], { metadata: [metadata, metadata] }, 'user123')).rejects.toThrow('second admission failed');
      expect(durable).toEqual([]);
      expect(prisma.document.create).not.toHaveBeenCalled();
      expect(prisma.document.delete).not.toHaveBeenCalled();
      expect(storage.deleteFile.mock.calls).toEqual([['/first'], ['/second']]);
      expect((service as any).numberingService.assignNumber).not.toHaveBeenCalled();
      expect((service as any).thumbnailService.regenerateThumbnail).not.toHaveBeenCalled();
      expect((prisma as any).$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    });
    it('does not return success when rollback file cleanup fails', async () => {
      (prisma.document.create as jest.Mock).mockRejectedValue(new Error('create failed'));
      (service as any).storage.deleteFile.mockImplementation(() => { throw new Error('cleanup failed'); });
      await expect(service.upload(file, metadata, 'user123')).rejects.toThrow('limpiar');
    });
  });

  describe('upload', () => {
    const uploadFile = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      size: 1000,
      path: '/tmp/test.txt',
    } as any;

    it('persists trimmed name and manual number at creation without changing original filename', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      await service.upload(uploadFile, { description: 'Agenda', documentTypeId: 12,
        name: '  Consejo  ', documentNumber: '  manual / 7  ' } as any, 'user123');
      const data = (prisma.document.create as jest.Mock).mock.calls[0][0].data;
      expect(data).toMatchObject({ name: 'Consejo', documentNumber: 'manual / 7' });
      expect(data.versions.create[0].filename).toBe('test.txt');
      expect((service as any).numberingService.assignNumber).not.toHaveBeenCalled();
      expect(prisma.document.findUnique).toHaveBeenCalledWith({
        where: { documentNumber: 'manual / 7' }, select: { id: true },
      });
    });

    it('defaults blank logical name to original filename and leaves numbering automatic', async () => {
      await service.upload(uploadFile, { description: 'Agenda', documentTypeId: 12,
        name: '  ', documentNumber: '  ' } as any, 'user123');
      const data = (prisma.document.create as jest.Mock).mock.calls[0][0].data;
      expect(data.name).toBe('test.txt');
      expect(data.documentNumber).toBeUndefined();
    });

    it('rejects an existing global number before finalizing storage without disclosure', async () => {
      await expect(service.upload(uploadFile, { description: 'Agenda', documentTypeId: 12,
        documentNumber: 'taken' } as any, 'user123')).rejects.toThrow('El número institucional ya está en uso');
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate trimmed numbers across a batch before finalizing storage', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.uploadMultiple([uploadFile, uploadFile], { metadata: [
        { description: 'One', documentTypeId: 12, documentNumber: ' same ' },
        { description: 'Two', documentTypeId: 12, documentNumber: 'same' },
      ] } as any, 'user123')).rejects.toThrow('El número institucional está repetido en la carga');
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
    });

    it('translates a uniqueness race after cleaning the finalized file', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.document.create as jest.Mock).mockRejectedValue({ code: 'P2002', meta: { target: ['documentNumber'] } });
      await expect(service.upload(uploadFile, { description: 'Agenda', documentTypeId: 12,
        documentNumber: 'race' } as any, 'user123')).rejects.toThrow('El número institucional ya está en uso');
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/test.pdf');
    });

    it('keeps the institutional number empty when it is omitted', async () => {
      const result = await service.upload(uploadFile, { description: 'Agenda', documentTypeId: 12 }, 'user123');
      expect((service as any).numberingService.assignNumber).not.toHaveBeenCalled();
      expect(result.documentNumber).toBeUndefined();
      expect(result.warnings).toEqual([]);
    });

    it('checks every existing batch number before any file is finalized', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 999 });
      await expect(service.uploadMultiple([uploadFile, uploadFile], { metadata: [
        { description: 'One', documentTypeId: 12, documentNumber: 'new' },
        { description: 'Two', documentTypeId: 12, documentNumber: 'taken' },
      ] } as any, 'user123')).rejects.toThrow('El número institucional ya está en uso');
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
    });

    it('rolls back batch persistence and compensates all files when a later number loses a uniqueness race', async () => {
      (prisma.document.findUnique as jest.Mock).mockResolvedValue(null);
      (service as any).storage.generateStructuredPath
        .mockReturnValueOnce({ path: '/first.txt' })
        .mockReturnValueOnce({ path: '/second.txt' });
      (prisma.document.create as jest.Mock)
        .mockResolvedValueOnce({ id: 1, versions: [{ path: '/first.txt' }] })
        .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['documentNumber'] } });
      await expect(service.uploadMultiple([uploadFile, uploadFile], { metadata: [
        { description: 'One', documentTypeId: 12, documentNumber: 'new' },
        { description: 'Two', documentTypeId: 12, documentNumber: 'race' },
      ] } as any, 'user123')).rejects.toThrow('El número institucional ya está en uso');
      expect(prisma.document.delete).not.toHaveBeenCalled();
      expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/first.txt');
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/second.txt');
    });

    it('resolves the default document type when the type is omitted', async () => {
      await service.upload(uploadFile, { description: 'Agenda' }, 'user123');

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(
        -1,
      )[0].data;
      expect(createData.documentTypeId).toBe(22);
      expect(createData.categoryId).toBeNull();
      expect(prisma.documentType.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true, isActive: true, categoryId: true },
      });
      expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
      expect(prisma.document.create).toHaveBeenCalled();
    });

    it('resolves the default document type when the type is explicitly null', async () => {
      await service.upload(
        uploadFile,
        { description: 'Agenda', documentTypeId: null },
        'user123',
      );

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(
        -1,
      )[0].data;
      expect(createData.documentTypeId).toBe(22);
      expect(createData.categoryId).toBeNull();
      expect(prisma.documentType.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true, isActive: true, categoryId: true },
      });
      expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a category that does not match the resolved default type', async () => {
      await expect(
        service.upload(
          uploadFile,
          { description: 'Agenda', categoryId: 99 },
          'user123',
        ),
      ).rejects.toThrow(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
      expect(prisma.documentType.findFirst).toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid concrete type before touching storage', async () => {
      await expect(
        service.upload(
          uploadFile,
          { description: 'Agenda', documentTypeId: 0 },
          'user123',
        ),
      ).rejects.toThrow();
      expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('uses the explicit active document type and its category', async () => {
      await service.upload(
        uploadFile,
        {
          description: 'Agenda',
          documentTypeId: 12,
          categoryId: 99,
        },
        'user123',
      );

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(
        -1,
      )[0].data;
      expect(createData.categoryId).toBe(99);
      expect(createData.name).toBe(uploadFile.originalname);
      expect(createData.documentTypeId).toBe(12);
      expect(prisma.documentType.findUnique).toHaveBeenCalledWith({
        where: { id: 12 },
        select: { id: true, isActive: true, categoryId: true },
      });
      expect(prisma.documentType.findFirst).not.toHaveBeenCalled();
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 99 },
        select: { id: true, allowedRoles: true, requiresCourse: true },
      });
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect(
        (service as any).storage.generateStructuredPath,
      ).toHaveBeenCalledWith('user123', 99, expect.any(String));
      expect((service as any).numberingService.assignNumber).not.toHaveBeenCalled();
    });

    it('rejects an inconsistent explicit category before moving the staged file', async () => {
      await expect(
        service.upload(
          uploadFile,
          {
            description: 'Agenda',
            documentTypeId: 12,
            categoryId: 404,
          },
          'user123',
        ),
      ).rejects.toThrow(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown document type before moving the staged file', async () => {
      (prisma.documentType.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.upload(
          uploadFile,
          { description: 'Agenda', documentTypeId: 404 },
          'user123',
        ),
      ).rejects.toThrow('El tipo de documento no existe');
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive document type before moving the staged file', async () => {
      (prisma.documentType.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 12,
        isActive: false,
      });

      await expect(
        service.upload(
          uploadFile,
          { description: 'Agenda', documentTypeId: 12 },
          'user123',
        ),
      ).rejects.toThrow('El tipo de documento está inactivo');
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('should create document with nested academic and template data', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1000,
        path: '/tmp/test.pdf',
      };

      const dto: UploadDocumentDto = {
        description: 'Test',
        documentTypeId: 12,
        academic: {
          courseId: 1,
          subjectId: 2,
          academicYearId: 3,
        },
        templateData: {
          templateId: 5,
        },
      };

      await service.upload(file, dto, 'user123');

      expect(prisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            academic: {
              create: {
                academicYearId: 3,
              },
            },
            templateData: {
              create: {
                templateId: 5,
              },
            },
            versions: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  filename: 'test.pdf',
                  mimetype: 'application/pdf',
                  size: 1000,
                  path: '/tmp/structured/test.pdf',
                  checksumSHA256: 'hash123',
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('continues PDF upload without extracted text when extraction fails', async () => {
      (textExtraction.extractFromFile as jest.Mock).mockResolvedValue(null);

      await service.upload(
        {
          originalname: 'failed.pdf',
          mimetype: 'application/pdf',
          size: 1,
          path: '/tmp/failed.pdf',
        } as any,
        { description: 'Agenda', documentTypeId: 12 } as UploadDocumentDto,
        'user123',
      );

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(
        -1,
      )[0].data;
      expect(createData.search).toEqual({ create: { extractedText: null } });
      expect(prisma.document.create).toHaveBeenCalled();
    });

    it('passes successful PDF extraction into upload persistence', async () => {
      jest
        .spyOn(textExtraction, 'extractFromFile')
        .mockResolvedValue('indexed text');

      await service.upload(
        {
          originalname: 'success.pdf',
          mimetype: 'application/pdf',
          size: 1,
          path: '/tmp/success.pdf',
        } as any,
        { description: 'Agenda', documentTypeId: 12 } as UploadDocumentDto,
        'user123',
      );

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(
        -1,
      )[0].data;
      expect(createData.search).toEqual({
        create: { extractedText: 'indexed text' },
      });
    });

    it('assigns uploads to a discoverable logical directory', async () => {
      await service.upload(
        {
          originalname: 'test.txt',
          mimetype: 'text/plain',
          size: 4,
          path: '/tmp/test.txt',
        } as any,
        {
          description: 'Agenda',
          directoryId: 7,
          documentTypeId: 12,
        } as UploadDocumentDto,
        'user123',
      );

      expect(
        (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data
          .directoryId,
      ).toBe(7);
    });

    it('rejects an unavailable upload destination before moving the staged file', async () => {
      (service as any).directoryService.assertCanUpload.mockRejectedValue(
        new Error('hidden'),
      );

      await expect(
        service.upload(
          {
            path: '/tmp/test.txt',
            originalname: 'test.txt',
            size: 1,
            mimetype: 'text/plain',
          } as any,
          {
            description: 'Agenda',
            directoryId: 9,
            documentTypeId: 12,
          } as UploadDocumentDto,
          'user123',
        ),
      ).rejects.toThrow('hidden');
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
    });

    it('removes the finalized file when document persistence fails', async () => {
      (prisma.document.create as jest.Mock).mockRejectedValueOnce(
        new Error('database unavailable'),
      );

      await expect(
        service.upload(
          {
            path: '/tmp/test.txt',
            originalname: 'test.txt',
            size: 1,
            mimetype: 'text/plain',
          } as any,
          { description: 'Agenda', documentTypeId: 12 } as UploadDocumentDto,
          'user123',
        ),
      ).rejects.toThrow('database unavailable');
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith(
        '/tmp/structured/test.pdf',
      );
    });

    it('removes the finalized file when hash preparation fails', async () => {
      (service as any).storage.calculateFileHash.mockRejectedValueOnce(
        new Error('hash unavailable'),
      );

      await expect(
        service.upload(
          {
            path: '/tmp/test.txt',
            originalname: 'test.txt',
            size: 1,
            mimetype: 'text/plain',
          } as any,
          { description: 'Agenda', documentTypeId: 12 } as UploadDocumentDto,
          'user123',
        ),
      ).rejects.toThrow('hash unavailable');
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith(
        '/tmp/structured/test.pdf',
      );
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('compensates every finalized file without any database writes when later preparation fails', async () => {
      const storage = (service as any).storage;
      storage.generateStructuredPath.mockReturnValueOnce({ path: '/tmp/structured/first.txt' }).mockReturnValueOnce({ path: '/tmp/structured/second.txt' });
      storage.calculateFileHash.mockResolvedValueOnce('hash').mockRejectedValueOnce(new Error('second upload failed'));

      await expect(
        service.uploadMultiple(
          [{ path: '/tmp/first.txt', originalname: 'first.txt', mimetype: 'text/plain' }, { path: '/tmp/second.txt', originalname: 'second.txt', mimetype: 'text/plain' }] as any,
          {
            metadata: [
              { description: 'One', documentTypeId: 12 },
              { description: 'Two', documentTypeId: 12 },
            ],
          },
          'user123',
        ),
      ).rejects.toThrow('second upload failed');

      expect((prisma as any).$transaction).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
      expect(prisma.document.delete).not.toHaveBeenCalled();
      expect(storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/first.txt');
      expect(storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/second.txt');
    });
  });

  describe('upload metadata integrity', () => {
    it('stores the Guayaquil upload day when origin is omitted and ignores isCurrent', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T04:59:59Z'));
      try {
        (prisma.academicYear.findMany as jest.Mock).mockResolvedValue([
          {
            id: 8,
            startDate: new Date('2025-01-01'),
            endDate: new Date('2025-12-31'),
            isActive: false,
          },
        ]);
        await service.upload(
          {
            path: '/tmp/one',
            originalname: 'one.txt',
            mimetype: 'text/plain',
          } as any,
          { description: 'Agenda', documentTypeId: 12 },
          'user123',
        );
        expect(
          (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data,
        ).toMatchObject({
          originDate: new Date('2025-12-31'),
          academic: { create: { academicYearId: 8 } },
        });
        expect(prisma.academicYear.findFirst).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
    it('accepts course-required categories without course metadata despite category role lists', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        requiresCourse: true,
        allowedRoles: [],
      });
      const file = {
        path: '/tmp/one',
        originalname: 'one.txt',
        mimetype: 'text/plain',
      } as any;
      await expect(
        service.upload(
          file,
          { description: 'Agenda', documentTypeId: 12 },
          'user123',
        ),
      ).resolves.toHaveProperty('id');
      (prisma.category.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        requiresCourse: true,
        allowedRoles: ['rector'],
      });
      await expect(
        service.upload(
          file,
          { description: 'Informe', documentTypeId: 12 },
          'user123',
          UserRole.SECRETARIO,
        ),
      ).resolves.toHaveProperty('id');
    });
    it('preserves ordered per-file metadata and preflights a later invalid type', async () => {
      const files = [
        { path: '/tmp/one', originalname: 'one.txt', mimetype: 'text/plain' },
        { path: '/tmp/two', originalname: 'two.txt', mimetype: 'text/plain' },
      ] as any;
      const metadata = [
        { description: 'One', documentTypeId: 12 },
        { description: 'Two', documentTypeId: 13, originDate: '2024-02-29' },
      ];
      (prisma.documentType.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({ id: where.id, isActive: true, categoryId: 99 }));
      await service.uploadMultiple(
        files,
        { directoryId: 7, metadata },
        'user123',
      );
      const create = prisma.document.create as jest.Mock;
      expect(create.mock.calls.map(([call]) => call.data.description)).toEqual(['One', 'Two']);
      expect(create.mock.calls.map(([call]) => call.data.directoryId)).toEqual([7, 7]);
      expect(create.mock.calls.map(([call]) => call.data.documentTypeId)).toEqual([12, 13]);
      expect(create.mock.calls[1][0].data.originDate).toEqual(new Date('2024-02-29'));
      create.mockClear();
      (service as any).storage.moveFile.mockClear();
      (prisma.documentType.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 12, isActive: true, categoryId: 99 })
        .mockResolvedValueOnce(null);
      await expect(
        service.uploadMultiple(files, { metadata }, 'user123'),
      ).rejects.toThrow('no existe');
      expect(create).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
    });
    it('trims upload descriptions and persists origin separately from the upload instant', async () => {
      const instant = new Date('2026-01-01T04:59:59Z');
      jest.useFakeTimers().setSystemTime(instant);
      try {
        (prisma.academicYear as any).findMany = jest.fn().mockResolvedValue([
          {
            id: 8,
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-12-31'),
            isActive: false,
          },
        ]);
        await service.upload(
          {
            originalname: 'one.txt',
            path: '/tmp/one',
            mimetype: 'text/plain',
          } as any,
          {
            description: '  Agenda  ',
            documentTypeId: 12,
            originDate: '2024-12-31',
            academic: { courseId: 3, subjectId: 4, academicYearId: 99 },
          } as any,
          'user123',
        );
        expect(
          (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data,
        ).toMatchObject({
          description: 'Agenda',
          originDate: new Date('2024-12-31'),
          createdAt: instant,
          academic: { create: { academicYearId: 8 } },
        });
        const academic = (prisma.document.create as jest.Mock).mock.calls.at(
          -1,
        )[0].data.academic.create;
        expect(academic).not.toHaveProperty('courseId');
        expect(academic).not.toHaveProperty('subjectId');
      } finally {
        jest.useRealTimers();
      }
    });
    it.each([{ ids: [] }, { ids: [1, 2] }])(
      'allows upload with a warning for zero or multiple matches (%j)',
      async ({ ids }) => {
        (prisma.academicYear as any).findMany = jest.fn().mockResolvedValue(
          ids.map((id) => ({
            id,
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
          })),
        );
        const result = await service.upload(
          {
            originalname: 'one.txt',
            path: '/tmp/one',
            mimetype: 'text/plain',
          } as any,
          {
            description: 'Agenda',
            documentTypeId: 12,
            originDate: '2026-01-01',
          } as any,
          'user123',
        );
        expect(result.warnings).toEqual([expect.any(String)]);
        expect(
          (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data
            .academic.create.academicYearId,
        ).toBeNull();
      },
    );
    it('validates all batch metadata before moving files or creating documents', async () => {
      await expect(
        service.uploadMultiple(
          [{ path: '/tmp/one' }, { path: '/tmp/two' }] as any,
          {
            metadata: [
              { description: 'Valid', documentTypeId: 12 },
              { description: '  ', documentTypeId: 12 },
            ],
          } as any,
          'user123',
        ),
      ).rejects.toThrow();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });
    it('rejects batch count mismatches before destination checks', async () => {
      await expect(
        service.uploadMultiple(
          [{ path: '/tmp/one' }] as any,
          { directoryId: 7, metadata: [] } as any,
          'user123',
        ),
      ).rejects.toThrow();
      expect(
        (service as any).directoryService.assertDiscoverable,
      ).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should include nested 1:1 relations in the query', async () => {
      jest
        .spyOn(prisma.document, 'findMany')
        .mockResolvedValue([{ id: 1 } as any]);

      await service.findAll(
        { page: 1, limit: 10 } as any,
        'user123',
        UserRole.ADMIN,
      );

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            academic: true,
            search: true,
            templateData: expect.any(Object),
            versions: expect.any(Object),
          }),
        }),
      );
    });

    it('filters root and directory listings without bypassing access predicates', async () => {
      await service.findAll(
        { page: 1, limit: 10, directoryId: 7 } as any,
        'user123',
        UserRole.ADMIN,
      );
      expect(
        (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].where.AND,
      ).toEqual(expect.arrayContaining([{ directoryId: 7 }]));
    });

    it('keeps viewer access predicates when filtering the logical root', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });

      await service.findAll(
        { page: 1, limit: 10, directoryId: null } as any,
        'viewer',
        UserRole.USER,
      );

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0]
        .where;
      expect(where.AND).toEqual(
        expect.arrayContaining([
          { directoryId: null },
          expect.objectContaining({ OR: expect.arrayContaining([
            { AND: [
              { receptionOriginDirectory: null, OR: [{ directory: null }, { directory: { receptionEnabled: false } }] },
              expect.objectContaining({ OR: expect.arrayContaining([{ uploadedById: 'viewer' }, { isPublic: true }]) }),
            ] },
          ]) }),
        ]),
      );
    });

    it('orders recent accessed documents by the current user activity types', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });
      (prisma.documentAccess.findMany as jest.Mock).mockResolvedValue([
        { documentId: 2 },
        { documentId: 1 },
        { documentId: 2 },
      ]);
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);
      (prisma.document.count as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll(
        { view: 'recent-accessed', page: 1, limit: 10 } as any,
        'viewer',
        UserRole.USER,
      );

      expect(result.data.map((document) => document.id)).toEqual([2, 1]);
      expect(prisma.documentAccess.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'viewer',
            action: { in: ['VIEW', 'DOWNLOAD', 'UPDATE'] },
          }),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          distinct: ['documentId'],
        }),
      );
    });

    it('scopes all documents while omitting automatic academic, batch, and composite filters', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });

      await service.findAll(
        {
          view: 'all',
          academicYearId: 3,
          excludeBatched: true,
          excludeComposites: true,
          page: 1,
          limit: 10,
        } as any,
        'viewer',
        UserRole.USER,
      );

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0]
        .where;
      expect(where.AND).toEqual(expect.arrayContaining([{ deletedAt: null }]));
      expect(where.AND).not.toEqual(
        expect.arrayContaining([
          { OR: [{ templateData: null }, { templateData: { batchId: null } }] },
          { isComposite: false },
        ]),
      );
      expect(where.AND.some((condition: any) => condition.academic)).toBe(
        false,
      );
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ OR: expect.arrayContaining([
            { AND: [
              { receptionOriginDirectory: null, OR: [{ directory: null }, { directory: { receptionEnabled: false } }] },
              expect.objectContaining({ OR: expect.arrayContaining([{ uploadedById: 'viewer' }, { isPublic: true }]) }),
            ] },
          ]) }),
        ]),
      );
    });

    it('keeps deleted documents out of all view even when includeDeleted is requested', async () => {
      await service.findAll(
        {
          view: 'all',
          includeDeleted: true,
          page: 1,
          limit: 10,
        } as any,
        'user123',
        UserRole.ADMIN,
      );

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0]
        .where;
      expect(where.AND).toEqual(expect.arrayContaining([{ deletedAt: null }]));
    });

    it('keeps trash restricted to deleted documents when includeDeleted is requested', async () => {
      await service.findAll(
        {
          view: 'trash',
          includeDeleted: true,
          page: 1,
          limit: 10,
        } as any,
        'user123',
        UserRole.ADMIN,
      );

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0]
        .where;
      expect(where.AND).toEqual(
        expect.arrayContaining([{ deletedAt: { not: null } }]),
      );
    });

    it('orders recently created documents by creation time', async () => {
      await service.findAll(
        { view: 'recent-created', page: 1, limit: 10 } as any,
        'user123',
        UserRole.ADMIN,
      );

      expect(
        (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].orderBy,
      ).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });
  });

  describe('move', () => {
    it('rejects a non-numeric destination before looking up the document', async () => {
      await expect(
        service.move(1, { directoryId: Number.NaN }, 'user123', UserRole.USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it('changes only logical placement for an editable document', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        directoryId: null,
      } as any);
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        directoryId: 7,
      });

      await service.move(1, { directoryId: 7 }, 'user123', UserRole.USER);

      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { directoryId: 7 },
      });
    });

    it('does not mutate an inaccessible document', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockRejectedValue(new NotFoundException('Documento no encontrado'));
      await expect(
        service.move(1, { directoryId: 7 }, 'user123', UserRole.USER),
      ).rejects.toThrow('Documento no encontrado');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('keeps a moved document available to an authorized viewer and preserves its file path', async () => {
      const movedDocument = {
        id: 1,
        uploadedById: 'owner',
        isPublic: true,
        directoryId: 7,
        versions: [{ path: '/files/active/original.pdf' }],
      };
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(movedDocument);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });
      (prisma.document.update as jest.Mock).mockResolvedValue({
        id: 1,
        directoryId: 7,
      });

      await service.move(1, { directoryId: 7 }, 'owner', UserRole.USER);
      const visibleDocument = await service.findOne(1, 'viewer', UserRole.USER);

      expect(visibleDocument.versions[0].path).toBe(
        '/files/active/original.pdf',
      );
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { directoryId: 7 },
      });
      expect(
        (prisma.document.findFirst as jest.Mock).mock.calls.at(-1)[0].where,
      ).toEqual(
        expect.objectContaining({
          id: 1,
          OR: expect.arrayContaining([
            { AND: [
              { receptionOriginDirectory: null, OR: [{ directory: null }, { directory: { receptionEnabled: false } }] },
              expect.objectContaining({ OR: expect.arrayContaining([{ isPublic: true }]) }),
            ] },
          ]),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should include nested 1:1 relations when fetching a specific document', async () => {
      jest
        .spyOn(prisma.document, 'findFirst')
        .mockResolvedValue({ id: 1, versions: [{}] } as any);

      await service.findOne(1, 'user123', UserRole.ADMIN);

      expect(prisma.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            academic: true,
            search: true,
            templateData: expect.any(Object),
            versions: expect.any(Object),
          }),
        }),
      );
    });

    it('returns detail capabilities without recording metadata reads as VIEW', async () => {
      const detail = await service.findOne(1, 'user123', UserRole.ADMIN, true);

      expect(detail.actionCapabilities).toBeDefined();
      expect(detail.batchCapabilities).toBeDefined();
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
    });
  });

  describe('view', () => {
    it('records preview activity as VIEW instead of DOWNLOAD', async () => {
      await service.view(1, 'user123', UserRole.ADMIN);

      expect(prisma.documentAccess.create).toHaveBeenCalledWith({
        data: { documentId: 1, userId: 'user123', action: 'VIEW' },
      });
    });
  });

  it('keeps logical name unchanged when replacing the original file', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, name: 'Consejo', uploadedById: 'user123',
      createdAt: new Date('2026-01-01'), currentVersion: 1, versions: [{ filename: 'old.txt', storedName: 'old.txt', path: '/old.txt' }] } as any);
    (service as any).storage.generateVersionPath = jest.fn().mockReturnValue({ path: '/version.txt' });
    (service as any).storage.copyFile = jest.fn();
    await service.replaceFile(1, { originalname: 'new.txt', mimetype: 'text/plain', path: '/new.txt', size: 1 } as any, 'user123', UserRole.USER);
    expect((prisma.document.update as jest.Mock).mock.calls[0][0].data).not.toHaveProperty('name');
    expect((prisma.documentVersion.create as jest.Mock).mock.calls[0][0].data.filename).toBe('new.txt');
  });

  it('searches logical name and original filename without replacing access conditions', async () => {
    await service.findAll({ search: 'Consejo' }, 'user123', UserRole.ADMIN);
    const where = (prisma.document.findMany as jest.Mock).mock.calls[0][0].where;
    const alternatives = where.AND.find((condition) => condition.OR?.some((item) => item.name)).OR;
    expect(alternatives).toContainEqual({ name: { contains: 'Consejo', mode: 'insensitive' } });
    expect(alternatives).toContainEqual({ versions: { some: { filename: { contains: 'Consejo', mode: 'insensitive' } } } });
    expect(where.AND).toContainEqual({ deletedAt: null });
  });

  it('matches the institutional number without replacing access conditions', async () => {
    await service.findAll({ search: 'GA-PLN-2026-0042' }, 'user123', UserRole.ADMIN);
    const where = (prisma.document.findMany as jest.Mock).mock.calls[0][0].where;
    const alternatives = where.AND.find((condition) => condition.OR?.some((item) => item.name)).OR;
    expect(alternatives).toContainEqual({ documentNumber: { contains: 'GA-PLN-2026-0042', mode: 'insensitive' } });
    expect(where.AND).toContainEqual({ deletedAt: null });
  });

  describe('update', () => {
    function identityDocument() {
      const document = { id: 1, uploadedById: 'user123', name: 'Historical title',
        documentNumber: 'Stored / 7', versions: [{ filename: 'historical.pdf' }] };
      jest.spyOn(service, 'findOne').mockResolvedValue(document as any);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      return document;
    }

    it('updates normalized document identity without renaming versions or generating numbers', async () => {
      identityDocument();
      await service.update(1, { name: '  Consejo  ', documentNumber: '  Manual / 7  ' } as any, 'user123', UserRole.USER);
      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: { documentNumber: 'Manual / 7', id: { not: 1 } }, select: { id: true },
      });
      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: 'Consejo', documentNumber: 'Manual / 7' }),
      }));
      expect(prisma.documentVersion.update).not.toHaveBeenCalled();
      expect((service as any).numberingService.assignNumber).not.toHaveBeenCalled();
      expect((service as any).numberingService.generateNumber).not.toHaveBeenCalled();
    });
    it.each(['', '  ', null])('persists explicit blank number %j as null', async documentNumber => {
      identityDocument();
      await service.update(1, { documentNumber } as any, 'user123', UserRole.USER);
      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ documentNumber: null }),
      }));
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
    });
    it('preserves stored identity when omitted and accepts the current number', async () => {
      identityDocument();
      await service.update(1, { description: 'Changed' }, 'user123', UserRole.USER);
      const data = (prisma.document.update as jest.Mock).mock.calls[0][0].data;
      expect(data).not.toHaveProperty('name');
      expect(data).not.toHaveProperty('documentNumber');
      await service.update(1, { documentNumber: 'Stored / 7' } as any, 'user123', UserRole.USER);
      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: { documentNumber: 'Stored / 7', id: { not: 1 } }, select: { id: true },
      });
    });
    it('rejects a number belonging to another document before persistence', async () => {
      identityDocument();
      (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 2 });
      await expect(service.update(1, { documentNumber: 'Taken' } as any, 'user123', UserRole.USER))
        .rejects.toThrow('El número institucional ya está en uso');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it('denies unauthorized identity edits before number lookup or persistence', async () => {
      identityDocument();
      await expect(service.update(1, { name: 'Forged', documentNumber: 'Taken' } as any, 'other', UserRole.USER))
        .rejects.toThrow('No tienes permiso');
      expect(prisma.document.findFirst).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it('translates a database number uniqueness race and preserves other database errors', async () => {
      identityDocument();
      (prisma.document.update as jest.Mock).mockRejectedValue({ code: 'P2002', meta: { target: ['documentNumber'] } });
      await expect(service.update(1, { documentNumber: 'Race' } as any, 'user123', UserRole.USER))
        .rejects.toThrow('El número institucional ya está en uso');
      const unrelated = { code: 'P2002', meta: { target: ['other'] } };
      (prisma.document.update as jest.Mock).mockRejectedValue(unrelated);
      await expect(service.update(1, { name: 'Name' } as any, 'user123', UserRole.USER)).rejects.toBe(unrelated);
    });

    it('blocks metadata edits while an active workflow is in progress', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
      } as any);
      (prisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
        id: 9,
        status: 'IN_PROGRESS',
      });

      await expect(
        service.update(
          1,
          { description: 'Blocked' } as any,
          'user123',
          UserRole.USER,
        ),
      ).rejects.toThrow(
        'No se puede editar un documento con un workflow activo',
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('allows the initiator to edit after changes are requested', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
        academic: { id: 1 },
      } as any);
      (prisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
        id: 9,
        status: 'CHANGES_REQUESTED',
        initiatedById: 'user123',
      });

      await service.update(
        1,
        { description: 'Corrected' } as any,
        'user123',
        UserRole.USER,
      );

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Corrected' }),
        }),
      );
    });

    it('should properly structure the update payload for nested relations', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'user123', versions: [{}], academic: { id: 1 } } as any);
      jest.spyOn(prisma.document, 'findUnique').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
        academic: { id: 1 },
      } as any);

      const dto = {
        description: 'Updated',
        academic: { courseId: 10 },
      };

      await service.update(1, dto as any, 'user123', UserRole.ADMIN);

      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            description: 'Updated',
            academic: {
              upsert: {
                create: expect.objectContaining({ courseId: 10 }),
                update: expect.objectContaining({ courseId: 10 }),
              },
            },
          }),
        }),
      );
    });

    function classificationDocument() {
      return {
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
        categoryId: 99,
        documentTypeId: 12,
      } as any;
    }

    it('rejects an unknown concrete document type before persisting', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());
      (prisma.documentType.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.update(
          1,
          { documentTypeId: 404 } as any,
          'user123',
          UserRole.USER,
        ),
      ).rejects.toThrow('El tipo de documento no existe');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('rejects an inactive concrete document type before persisting', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());
      (prisma.documentType.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 12,
        isActive: false,
        categoryId: 99,
      });

      await expect(
        service.update(
          1,
          { documentTypeId: 12 } as any,
          'user123',
          UserRole.USER,
        ),
      ).rejects.toThrow('El tipo de documento está inactivo');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('rejects a category that does not match the selected document type', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());

      await expect(
        service.update(
          1,
          { documentTypeId: 12, categoryId: 404 } as any,
          'user123',
          UserRole.USER,
        ),
      ).rejects.toThrow(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('derives the category from the selected concrete document type', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());

      await service.update(
        1,
        { documentTypeId: 12 } as any,
        'user123',
        UserRole.USER,
      );

      expect(prisma.documentType.findUnique).toHaveBeenCalledWith({
        where: { id: 12 },
        select: { id: true, isActive: true, categoryId: true },
      });
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documentTypeId: 12, categoryId: 99 }),
        }),
      );
    });

    it('resolves the default document type on explicit null and derives its category', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());

      await service.update(
        1,
        { documentTypeId: null } as any,
        'user123',
        UserRole.USER,
      );

      const data = (prisma.document.update as jest.Mock).mock.calls[0][0].data;
      expect(data.documentTypeId).toBe(22);
      expect(data.categoryId).toBeNull();
      expect(prisma.documentType.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true, isActive: true, categoryId: true },
      });
      expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an explicit category that does not match the default type on explicit null', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());

      await expect(
        service.update(
          1,
          { documentTypeId: null, categoryId: 5 } as any,
          'user123',
          UserRole.USER,
        ),
      ).rejects.toThrow(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('rejects a category-only change that would invalidate the existing type', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(classificationDocument());

      await expect(
        service.update(
          1,
          { categoryId: 404 } as any,
          'user123',
          UserRole.USER,
        ),
      ).rejects.toThrow(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('allows a category change for a generic document', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
        categoryId: null,
        documentTypeId: null,
      } as any);

      await service.update(
        1,
        { categoryId: 5 } as any,
        'user123',
        UserRole.USER,
      );

      expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: 5 }),
        }),
      );
    });
  });

  describe('workflow editing integration', () => {
    it('blocks text edits while an active workflow is in progress', async () => {
      const document = {
        id: 1,
        uploadedById: 'user123',
        currentVersion: 1,
        versions: [{ mimetype: 'text/plain', path: '/uploads/document.txt' }],
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(document as any);
      (prisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
        id: 9,
        status: 'PENDING',
      });

      await expect(
        service.saveTextContent(1, 'Blocked', 'user123', UserRole.USER),
      ).rejects.toThrow(
        'No se puede editar un documento con un workflow activo',
      );
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
  });

  describe('saveTextContent', () => {
    const document = {
      id: 1,
      uploadedById: 'user123',
      categoryId: 2,
      currentVersion: 4,
      checksumSHA256: 'old-checksum',
      createdAt: new Date('2026-01-01'),
      versions: [
        {
          id: 10,
          filename: 'notes.txt',
          mimetype: 'text/plain',
          storedName: 'stored-notes.txt',
          path: '/uploads/stored-notes.txt',
          size: 3,
          checksumSHA256: 'old-checksum',
        },
      ],
    };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(document as any);
      (fs.writeFileSync as jest.Mock).mockClear();
      (prisma.document.update as jest.Mock).mockResolvedValue({
        ...document,
        currentVersion: 5,
        checksumSHA256: 'new-checksum',
      });
      (prisma.documentVersion.count as jest.Mock).mockResolvedValue(1);
      (prisma.documentVersion.create as jest.Mock).mockImplementation(async ({ data }) => ({ id: 11, ...data }));
      (prisma.documentAccess.create as jest.Mock).mockResolvedValue({ id: 12 });
      (service as any).storage.calculateFileHash.mockResolvedValue(
        'new-checksum',
      );
    });

    it('saves editable text, versions it, audits it, and regenerates its thumbnail', async () => {
      const content = 'Updated text';

      await service.saveTextContent(1, content, 'user123', UserRole.USER);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/tmp/structured/test.pdf',
        Buffer.from(content, 'utf-8'),
        { flag: 'wx' },
      );
      expect(prisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: {
            currentVersion: 5,
            checksumSHA256: 'new-checksum',
            search: { upsert: { create: { extractedText: null }, update: { extractedText: null } } },
          },
        }),
      );
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 1,
          version: 5,
          filename: 'notes.txt',
          mimetype: 'text/plain',
          storedName: expect.stringMatching(/^[a-f0-9-]+\.txt$/),
          path: '/tmp/structured/test.pdf',
          size: Buffer.byteLength(content, 'utf-8'),
          checksumSHA256: 'new-checksum',
          comment: 'Editado con editor básico',
          createdById: 'user123',
          source: 'REEMPLAZO_MANUAL',
        }),
      });
      expect(prisma.documentAccess.create).toHaveBeenCalledWith({
        data: { documentId: 1, userId: 'user123', action: 'UPDATE' },
      });
      expect(
        (service as any).thumbnailService.regenerateThumbnail,
      ).toHaveBeenCalledWith('/tmp/structured/test.pdf', 1, 'text/plain');
    });

    it.each([
      'application/json',
      'application/xml',
      'application/javascript',
      'application/csv',
    ])('accepts editable MIME type %s', async (mimetype) => {
      (service as any).findOne.mockResolvedValue({
        ...document,
        versions: [{ ...document.versions[0], mimetype }],
      });

      await expect(
        service.saveTextContent(1, '{}', 'user123', UserRole.USER),
      ).resolves.toEqual(expect.objectContaining({ currentVersion: 5 }));
    });

    it('rejects unsupported MIME types without mutating the document', async () => {
      (service as any).findOne.mockResolvedValue({
        ...document,
        versions: [{ ...document.versions[0], mimetype: 'application/pdf' }],
      });

      await expect(
        service.saveTextContent(1, 'not editable', 'user123', UserRole.USER),
      ).rejects.toThrow(
        'Este tipo de archivo no se puede editar con el editor básico',
      );
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
    });

    it('denies users without replacement permission without changing state', async () => {
      (service as any).findOne.mockResolvedValue({
        ...document,
        uploadedById: 'owner-id',
      });

      await expect(
        service.saveTextContent(1, 'forbidden', 'user123', UserRole.USER),
      ).rejects.toThrow('No tienes permiso');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
    });

    it('does not prune rows or files even when the legacy count limit is exceeded', async () => {
      (
        service as any
      ).settingsService.getMaxVersionsPerDocument.mockResolvedValue(1);
      (prisma.documentVersion.count as jest.Mock).mockResolvedValue(2);
      (prisma.documentVersion.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 10, path: '/uploads/stored-notes.txt' }])
        .mockResolvedValueOnce([{ path: '/uploads/stored-notes.txt' }]);

      await service.saveTextContent(1, 'new content', 'user123', UserRole.USER);

      expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
      expect(prisma.documentVersion.count).not.toHaveBeenCalled();
      expect((service as any).storage.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('reception read query chains', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-14T12:00:00Z')));
    afterEach(() => jest.useRealTimers());
    it('does not announce ordinary sharing authority for a reception reader', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'reader', role: UserRole.ADMIN });
      const document = { id: 1, uploadedById: 'reader', directory: { receptionEnabled: true } };
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(document);
      (prisma.document.findMany as jest.Mock).mockResolvedValue([document]);
      expect((await service.findOne(1, 'reader', UserRole.ADMIN)).canManageSharing).toBe(false);
      expect((await service.findAll({}, 'reader', UserRole.ADMIN)).data[0].canManageSharing).toBe(false);
    });

    it.each(['detail', 'view', 'download', 'history'])('%s enforces the live filter before returning content or recording access', async (route) => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'revoked', role: UserRole.ADMIN });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);
      const read = route === 'detail' ? service.findOne(1, 'revoked', UserRole.ADMIN, true)
        : route === 'history' ? service.getVersions(1, 'revoked', UserRole.ADMIN)
        : route === 'view' ? service.view(1, 'revoked', UserRole.ADMIN)
        : service.download(1, 'revoked', UserRole.ADMIN);
      await expect(read).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1, ...buildDocumentAccessFilter({ id: 'revoked', role: UserRole.ADMIN }) },
      }));
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
      expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
    });
  });

  describe('aggregate read identity', () => {
    const methods = ['stats', 'dashboard', 'categories', 'calendar'] as const;
    function read(method: typeof methods[number], role: UserRole) {
      if (method === 'stats') return service.getStats('requested', role);
      if (method === 'dashboard') return service.getDashboardSummary('requested', role);
      if (method === 'categories') return service.getCategories('requested', role);
      return service.getDocumentsByDate('requested', role);
    }

    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-06-10T12:00:00Z') });
      (prisma.document as any).groupBy = jest.fn().mockResolvedValue([]);
    });
    afterEach(() => jest.useRealTimers());

    it('preserves optional calendar bounds, category and grouped response for an ordinary user', async () => {
      const current = { id: 'requested', role: UserRole.USER };
      const start = new Date('2026-06-01T00:00:00Z');
      const end = new Date('2026-06-30T23:59:59Z');
      const document = { id: 1, createdAt: new Date('2026-06-10T12:00:00Z') };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(current);
      (prisma.document.findMany as jest.Mock).mockResolvedValue([document]);
      await expect(service.getDocumentsByDate(current.id, current.role, start, end, 7)).resolves.toEqual({
        documents: [document], groupedByDate: { '2026-06-10': [document] }, totalDocuments: 1,
      });
      expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { AND: [
          { deletedAt: null },
          buildDocumentAccessFilter(current),
          { createdAt: { gte: start, lte: end } }, { categoryId: 7 },
        ] },
      }));
    });

    it.each(methods.flatMap((method) => [UserRole.ADMIN, UserRole.RECTOR, UserRole.USER].map((role) => [method, role] as const)))
      ('%s rejects missing current users despite caller role %s', async (method, role) => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
        await expect(read(method, role)).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.document.findMany).not.toHaveBeenCalled();
        expect(prisma.document.count).not.toHaveBeenCalled();
        expect((prisma.document as any).groupBy).not.toHaveBeenCalled();
        expect(prisma.documentVersion.aggregate).not.toHaveBeenCalled();
      });

    it.each(methods.flatMap((method) => [UserRole.ADMIN, UserRole.RECTOR, UserRole.USER].flatMap((role) =>
      [false, true].map((stale) => [method, role, stale] as const))))
      ('%s preserves current identity and role %s with stale caller=%s', async (method, role, stale) => {
        const current = { id: stale ? 'current' : 'requested', role };
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(current);
        const callerRole = stale ? (role === UserRole.ADMIN ? UserRole.USER : UserRole.ADMIN) : role;
        await read(method, callerRole);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'requested' }, select: { id: true, role: true } });
        const query = method === 'stats' || method === 'dashboard'
          ? (prisma.document.count as jest.Mock).mock.calls[0][0]
          : method === 'categories' ? (prisma.document as any).groupBy.mock.calls[0][0]
          : (prisma.document.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where.AND).toContainEqual(buildDocumentAccessFilter(current));
        if (method === 'stats') {
          expect(prisma.documentVersion.aggregate).toHaveBeenCalledWith({ where: { document: query.where }, _sum: { size: true } });
        }
      });
  });

  describe('getStats', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-14T12:00:00Z'));
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user123', role: UserRole.USER });
    });
    afterEach(() => jest.useRealTimers());

    it('non-admin: scopes document count and size sum to the user', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(36);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: 1_048_576 },
      });

      await service.getStats('user123', UserRole.USER);

      expect(prisma.document.count).toHaveBeenCalledWith({
        where: { deletedAt: null, AND: [buildDocumentAccessFilter({ id: 'user123', role: UserRole.USER })] },
      });
      expect(prisma.documentVersion.aggregate).toHaveBeenCalledWith({
        where: {
          document: { deletedAt: null, AND: [buildDocumentAccessFilter({ id: 'user123', role: UserRole.USER })] },
        },
        _sum: { size: true },
      });
    });

    it('returns total size and formatted MB for a known byte sum', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(36);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: 1_048_576 },
      });

      const stats = await service.getStats('user123', UserRole.USER);

      expect(stats).toEqual({
        totalDocuments: 36,
        totalSize: 1_048_576,
        totalSizeMB: '1.00',
      });
    });

    it('admin: omits uploadedById from both scopes', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'admin1', role: UserRole.ADMIN });
      (prisma.document.count as jest.Mock).mockResolvedValue(10);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: 512 },
      });

      await service.getStats('admin1', UserRole.ADMIN);

      const scope = { deletedAt: null, AND: [buildDocumentAccessFilter({ id: 'admin1', role: UserRole.ADMIN })] };
      expect(prisma.document.count).toHaveBeenCalledWith({
        where: scope,
      });
      expect(prisma.documentVersion.aggregate).toHaveBeenCalledWith({
        where: { document: scope },
        _sum: { size: true },
      });
    });

    it('handles a null size sum as 0 bytes', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(0);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: null },
      });

      const stats = await service.getStats('user123', UserRole.USER);

      expect(stats).toEqual({
        totalDocuments: 0,
        totalSize: 0,
        totalSizeMB: '0.00',
      });
    });
  });

  describe('getDashboardSummary', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-14T12:00:00Z')));
    afterEach(() => jest.useRealTimers());
    it('uses one active ReBAC DRAFT predicate for count and pending rows', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user123',
        role: UserRole.USER,
      });
      (prisma.document.count as jest.Mock).mockResolvedValue(6);
      (prisma.document.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockResolvedValueOnce([{ id: 3 }]);

      const summary = await service.getDashboardSummary(
        'user123',
        UserRole.USER,
      );

      const countWhere = (prisma.document.count as jest.Mock).mock.calls[0][0]
        .where;
      const pendingWhere = (prisma.document.findMany as jest.Mock).mock
        .calls[0][0].where;

      expect(pendingWhere).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            { deletedAt: null },
            { archivedAt: null },
            { workflow: { some: { active: true, status: 'DRAFT' } } },
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
      );
      expect(countWhere).toEqual(pendingWhere);
      expect(summary).toEqual(
        expect.objectContaining({
          pendingOfficializationCount: 6,
          pendingOfficialization: [{ id: 1 }, { id: 2 }],
          pendingHasMore: false,
          recent: [{ id: 3 }],
          recentHasMore: false,
          generatedAt: expect.any(String),
        }),
      );
    });

    it('keeps privileged roles ReBAC-visible while excluding archived and deleted rows', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'rector1',
        role: UserRole.RECTOR,
      });

      await service.getDashboardSummary('rector1', UserRole.RECTOR);

      const pendingWhere = (prisma.document.findMany as jest.Mock).mock
        .calls[0][0].where;
      expect(pendingWhere).toEqual({
        AND: [
          { deletedAt: null },
          { archivedAt: null },
          buildDocumentAccessFilter({ id: 'rector1', role: UserRole.RECTOR }),
          { workflow: { some: { active: true, status: 'DRAFT' } } },
        ],
      });
    });

    it('fetches six rows to expose hasMore and orders both lists by updatedAt then id', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user123',
        role: UserRole.USER,
      });
      await service.getDashboardSummary('user123', UserRole.USER);

      for (const call of (prisma.document.findMany as jest.Mock).mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            take: 6,
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            select: expect.objectContaining({
              documentNumber: true,
              versions: expect.any(Object),
              uploadedBy: expect.any(Object),
              category: expect.any(Object),
              workflow: expect.any(Object),
            }),
          }),
        );
      }
    });

    it('rejects limits outside the fixed five-row contract', async () => {
      await expect(
        service.getDashboardSummary('user123', UserRole.USER, 6),
      ).rejects.toThrow('El límite del resumen debe estar entre 1 y 5');
    });
  });

  describe('document action capabilities readback', () => {
    it('attaches outgoing owner sharing summaries to list/detail without exposing other recipients', async () => {
      const document = { id: 1, uploadedById: 'owner', directoryId: null, isPublic: false };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'owner', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([document, { ...document, id: 2 }]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(document);
      const live = jest.fn(async ({ where }) => typeof where.userId === 'string' ? [] : [
        { documentId: 1, directoryId: null, userId: 'private-recipient' },
        { documentId: 2, directoryId: null, userId: 'private-recipient' },
      ]);
      (prisma as any).effectiveAccessGrant = { findMany: live };
      const list = await service.findAll({ limit: 2 }, 'owner', UserRole.USER);
      expect(list.data.map(row => row.sharingSummary)).toEqual([
        { shared: true, direct: true, inherited: false, public: false },
        { shared: true, direct: true, inherited: false, public: false },
      ]);
      expect(list.data.map(row => row.sharingProvenance)).toEqual([[], []]);
      expect(JSON.stringify(list)).not.toContain('private-recipient');
      expect(live).toHaveBeenCalledTimes(2);
      const detail = await service.findOne(1, 'owner', UserRole.USER, true);
      expect(detail.sharingSummary).toEqual(list.data[0].sharingSummary);
      expect(detail.sharingProvenance).toEqual([]);
      expect(live).toHaveBeenCalledTimes(4);
    });
    describe('batch-specific capabilities', () => {
      const ordinary = { id: 1, uploadedById: 'author' };
      const reception = { ...ordinary, receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true } };
      async function read(actor = 'author', document: any = ordinary) {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: actor, role: UserRole.ADMIN });
        (prisma.document.findMany as jest.Mock).mockResolvedValue([document]);
        (prisma.document.findFirst as jest.Mock).mockResolvedValue(document);
        const list = await service.findAll({}, actor, UserRole.ADMIN);
        const detail = await service.findOne(1, actor, UserRole.ADMIN, true);
        expect((detail as any).batchCapabilities).toEqual((list.data[0] as any).batchCapabilities);
        return (detail as any).batchCapabilities;
      }
      function participate(peerRead = false) {
        (prisma.directory.findMany as jest.Mock).mockResolvedValue([
          { id: 2, createdById: 'manager', receptionEnabled: true },
        ]);
        (prisma.directoryUserParticipant.findMany as jest.Mock).mockResolvedValue([
          { directoryId: 2, peerRead },
        ]);
      }
      it('preserves ordinary owner bulk authority even during active review', async () => {
        (prisma.documentWorkflow.findMany as jest.Mock).mockResolvedValue([
          { documentId: 1, status: WorkflowStatus.IN_PROGRESS, initiatedById: 'other' },
        ]);
        expect(await read()).toEqual({ scope: 'ordinary', update: true, trash: true,
          restore: true, permanentDelete: true, export: true });
      });
      it('does not infer ordinary bulk authority from ADMIN or public read access', async () => {
        expect(await read('admin')).toEqual({ scope: 'ordinary', update: false, trash: false,
          restore: false, permanentDelete: false, export: false });
      });
      it.each([
        ['canEdit', { update: true, restore: true }],
        ['canDelete', { trash: true, permanentDelete: true }],
        ['canView', { export: true }],
      ])('keeps direct %s bulk grants independent', async (grant, allowed) => {
        (prisma.documentPermission.findMany as jest.Mock).mockResolvedValue([
          { documentId: 1, [grant]: true },
        ]);
        expect(await read('reader')).toEqual({ scope: 'ordinary', update: false, trash: false,
          restore: false, permanentDelete: false, export: false, ...allowed });
      });
      it('allows live reception author operations but never permanent bulk deletion', async () => {
        participate();
        expect(await read('author', reception)).toEqual({ scope: 'reception', update: true,
          trash: true, restore: true, permanentDelete: false, export: true });
      });
      it('blocks reception update and withdrawal during active review without blocking export', async () => {
        participate();
        (prisma.documentWorkflow.findMany as jest.Mock).mockResolvedValue([
          { documentId: 1, status: WorkflowStatus.IN_PROGRESS, initiatedById: 'author' },
        ]);
        expect(await read('author', reception)).toEqual({ scope: 'reception', update: false,
          trash: false, restore: false, permanentDelete: false, export: true });
      });
      it('permits correction metadata but not withdrawal in CHANGES_REQUESTED', async () => {
        participate();
        (prisma.documentWorkflow.findMany as jest.Mock).mockResolvedValue([
          { documentId: 1, status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'author' },
        ]);
        expect(await read('author', reception)).toEqual({ scope: 'reception', update: true,
          trash: false, restore: false, permanentDelete: false, export: true });
      });
      it('allows peer export but rejects all mutations despite ordinary direct grants', async () => {
        participate(true);
        (prisma.documentPermission.findMany as jest.Mock).mockResolvedValue([
          { documentId: 1, canEdit: true, canDelete: true, canView: true },
        ]);
        expect(await read('peer', reception)).toEqual({ scope: 'reception', update: false,
          trash: false, restore: false, permanentDelete: false, export: true });
      });
      it('denies revoked reception author authority despite stale ordinary grants', async () => {
        (prisma.directory.findMany as jest.Mock).mockResolvedValue([
          { id: 2, createdById: 'manager', receptionEnabled: true },
        ]);
        (prisma.documentPermission.findMany as jest.Mock).mockResolvedValue([
          { documentId: 1, canEdit: true, canDelete: true, canView: true },
        ]);
        expect(await read('author', reception)).toEqual({ scope: 'reception', update: false,
          trash: false, restore: false, permanentDelete: false, export: false });
      });
      it('loads actor-specific direct grants once for returned page ids', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'reader', role: UserRole.USER });
        (prisma.document.findMany as jest.Mock).mockResolvedValue([ordinary, { ...ordinary, id: 3 }]);
        await service.findAll({}, 'reader', UserRole.USER);
        expect(prisma.documentPermission.findMany).toHaveBeenCalledTimes(3);
        expect((prisma.documentPermission.findMany as jest.Mock).mock.calls.filter(([query]) =>
          query.where.userId === 'reader' && query.select?.canEdit === true)).toHaveLength(1);
        expect(prisma.documentPermission.findMany).toHaveBeenCalledWith({
          where: { documentId: { in: [1, 3] }, userId: 'reader' },
          select: { documentId: true, canEdit: true, canDelete: true, canView: true },
        });
      });
      it('does not query direct grants on an empty page', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'reader', role: UserRole.USER });
        await service.findAll({}, 'reader', UserRole.USER);
        expect(prisma.documentPermission.findMany).not.toHaveBeenCalled();
      });
    });

    const receptionDocument = {
      id: 1,
      uploadedById: 'author',
      directory: { id: 2, receptionEnabled: true },
      receptionOriginDirectoryId: 2,
    };

    it('attaches actionCapabilities to list and detail additively', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'reader',
        role: UserRole.USER,
      });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 1, uploadedById: 'reader' },
      ]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        uploadedById: 'reader',
      });

      const list = await service.findAll({}, 'reader', UserRole.USER);
      expect(list.data[0].actionCapabilities).toEqual({
        editMetadata: true,
        editContent: true,
        move: true,
        trash: true,
        restore: false,
        permanentDelete: true,
        manageSharing: true,
        scope: 'ordinary',
      });
      const detail = await service.findOne(1, 'reader', UserRole.USER, true);
      expect(detail.actionCapabilities).toEqual(list.data[0].actionCapabilities);
      expect(detail.canManageSharing).toBe(true);
    });

    it('derives capabilities from the current database actor rather than the caller role', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'admin',
        role: UserRole.ADMIN,
      });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        { id: 1, uploadedById: 'owner' },
      ]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        uploadedById: 'owner',
      });

      const list = await service.findAll({}, 'admin', UserRole.USER);
      expect(list.data[0].actionCapabilities.permanentDelete).toBe(false);
      expect(list.data[0].actionCapabilities.trash).toBe(false);
    });

    it('denies mutation capabilities for a reception peer read-only participant', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'peer',
        role: UserRole.USER,
      });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([receptionDocument]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(receptionDocument);
      (prisma.directory.findMany as jest.Mock).mockResolvedValue([
        { id: 2, createdById: 'author', receptionEnabled: true },
      ]);
      (prisma.directoryUserParticipant.findMany as jest.Mock).mockResolvedValue([
        { directoryId: 2, peerRead: true },
      ]);

      const caps = (await service.findOne(1, 'peer', UserRole.USER, true)).actionCapabilities;
      expect(caps).toEqual({
        editMetadata: false,
        editContent: false,
        move: false,
        trash: false,
        restore: false,
        permanentDelete: false,
        manageSharing: false,
        scope: 'reception',
      });
    });
  });

  describe('document action capabilities bounds and policy', () => {
    function ordinaryDocument(id: number, uploadedById = 'owner') {
      return { id, uploadedById };
    }
    function receptionDocument(id: number, uploadedById = 'author') {
      return {
        id,
        uploadedById,
        directory: { id: 2, receptionEnabled: true },
        receptionOriginDirectoryId: 2,
      };
    }
    function grantReception(authorityId = 'author') {
      (prisma.directory.findMany as jest.Mock).mockResolvedValue([
        { id: 2, createdById: authorityId, receptionEnabled: true },
      ]);
      (prisma.directoryUserParticipant.findMany as jest.Mock).mockResolvedValue([
        { directoryId: 2, peerRead: true },
      ]);
    }

    it('bounds context queries to one per concern regardless of page size', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'actor', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        ordinaryDocument(1),
        ordinaryDocument(2),
        ordinaryDocument(3),
      ]);

      await service.findAll({}, 'actor', UserRole.USER);

      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.documentWorkflow.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.workflowApproval.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.directoryUserParticipant.findMany).not.toHaveBeenCalled();
      expect(prisma.directoryRoleParticipant.findMany).not.toHaveBeenCalled();
    });

    it('skips context queries for an empty page', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'actor', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAll({}, 'actor', UserRole.USER);

      expect(prisma.documentWorkflow.findMany).not.toHaveBeenCalled();
      expect(prisma.workflowApproval.findMany).not.toHaveBeenCalled();
      expect(prisma.directory.findMany).not.toHaveBeenCalled();
    });

    it('deduplicates reception origin directory ids across the page', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([
        receptionDocument(1),
        receptionDocument(2),
      ]);
      grantReception();

      await service.findAll({}, 'author', UserRole.USER);

      expect(prisma.directory.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.directory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [2] } } }),
      );
      expect(prisma.directoryUserParticipant.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.documentWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { documentId: { in: [1, 2] }, active: true } }),
      );
    });

    it('returns identical capabilities for the same document in list and detail', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([receptionDocument(1)]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(receptionDocument(1));
      grantReception();

      const listCaps = (await service.findAll({}, 'author', UserRole.USER)).data[0].actionCapabilities;
      const detailCaps = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(detailCaps).toEqual(listCaps);
    });

    it('propagates a database read failure instead of inventing capabilities', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'actor', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([ordinaryDocument(1)]);
      (prisma.documentWorkflow.findMany as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(service.findAll({}, 'actor', UserRole.USER)).rejects.toThrow('db down');
    });

    it('revokes reception mutation capabilities when the live role assignment disappears', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(receptionDocument(1));
      (prisma.directory.findMany as jest.Mock).mockResolvedValue([
        { id: 2, createdById: 'author', receptionEnabled: true },
      ]);
      (prisma.directoryRoleParticipant.findMany as jest.Mock).mockResolvedValueOnce([
        { directoryId: 2, peerRead: false },
      ]);
      const active = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(active.editMetadata).toBe(true);

      (prisma.directoryRoleParticipant.findMany as jest.Mock).mockResolvedValueOnce([]);
      const revoked = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(revoked.editMetadata).toBe(false);
      expect(revoked.scope).toBe('reception');
    });

    it('keeps reception scope for a document moved into an ordinary folder', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue({
        id: 1,
        uploadedById: 'author',
        directory: { id: 9, receptionEnabled: false },
        receptionOriginDirectoryId: 2,
      });
      grantReception();

      const caps = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(caps.scope).toBe('reception');
      expect(caps.editMetadata).toBe(true);
      expect(caps.manageSharing).toBe(false);
    });

    it('fails closed when the reception origin directory cannot be resolved', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(receptionDocument(1));
      (prisma.directory.findMany as jest.Mock).mockResolvedValue([]);

      const caps = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(caps.scope).toBe('reception');
      expect(caps.editMetadata).toBe(false);
      expect(caps.move).toBe(false);
      expect(caps.permanentDelete).toBe(false);
    });

    it('blocks reception withdrawal during a DRAFT review while keeping edits available', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(receptionDocument(1));
      grantReception();
      (prisma.documentWorkflow.findMany as jest.Mock).mockResolvedValue([
        { documentId: 1, status: WorkflowStatus.DRAFT, initiatedById: 'author' },
      ]);

      const caps = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(caps.trash).toBe(false);
      expect(caps.move).toBe(false);
      expect(caps.editMetadata).toBe(true);
    });

    it('lets only the CHANGES_REQUESTED initiator edit during an active workflow', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument(1, 'author'));
      (prisma.documentWorkflow.findMany as jest.Mock).mockResolvedValueOnce([
        { documentId: 1, status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'author' },
      ]);
      const initiator = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(initiator.editMetadata).toBe(true);

      (prisma.documentWorkflow.findMany as jest.Mock).mockResolvedValueOnce([
        { documentId: 1, status: WorkflowStatus.CHANGES_REQUESTED, initiatedById: 'other' },
      ]);
      const other = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(other.editMetadata).toBe(false);
    });

    it('requires live authorship rather than ADMIN intersection for reception permanent delete', async () => {
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(receptionDocument(1));
      grantReception();

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.USER });
      const nonAdmin = (await service.findOne(1, 'author', UserRole.USER, true)).actionCapabilities;
      expect(nonAdmin.permanentDelete).toBe(true);
      expect(nonAdmin.editMetadata).toBe(true);

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author', role: UserRole.ADMIN });
      const admin = (await service.findOne(1, 'author', UserRole.ADMIN, true)).actionCapabilities;
      expect(admin.permanentDelete).toBe(true);
    });

    it('grants a pending approver content edits but not metadata edits', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'approver', role: UserRole.USER });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument(1, 'owner'));
      (prisma.workflowApproval.findMany as jest.Mock).mockResolvedValue([
        { workflow: { documentId: 1 } },
      ]);

      const caps = (await service.findOne(1, 'approver', UserRole.USER, true)).actionCapabilities;
      expect(caps.editContent).toBe(true);
      expect(caps.editMetadata).toBe(false);
    });

    it('keeps top-level canManageSharing coherent with actionCapabilities.manageSharing', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'owner', role: UserRole.USER });
      (prisma.document.findMany as jest.Mock).mockResolvedValue([ordinaryDocument(1, 'owner')]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument(1, 'owner'));

      const list = await service.findAll({}, 'owner', UserRole.USER);
      expect(list.data[0].canManageSharing).toBe(list.data[0].actionCapabilities.manageSharing);
      const detail = await service.findOne(1, 'owner', UserRole.USER, true);
      expect(detail.canManageSharing).toBe(detail.actionCapabilities.manageSharing);
    });
  });

  describe('action capabilities legacy vs catalog role semantics', () => {
    function catalogActor(roleKey: string, isActive = true) {
      return {
        id: 'catalog',
        role: UserRole.USER,
        roleAssignments: [{ role: { id: 5, key: roleKey, isActive } }],
      };
    }
    function ordinaryDocument() {
      return { id: 1, uploadedById: 'owner' };
    }

    it.each(['admin', 'rector', 'vicerrector'])(
      'denies ordinary mutations to a legacy USER with an active catalog %s assignment (non-owner)',
      async (roleKey) => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(catalogActor(roleKey));
        (prisma.document.findMany as jest.Mock).mockResolvedValue([ordinaryDocument()]);
        (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument());

        const caps = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
        expect(caps).toMatchObject({
          editMetadata: false,
          editContent: false,
          move: false,
          trash: false,
          restore: false,
          permanentDelete: false,
          scope: 'ordinary',
        });
      },
    );

    it('does not infer sharing authority from effective catalog ADMIN for a non-owner', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(catalogActor('admin'));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument());

      const caps = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
      expect(caps.manageSharing).toBe(false);
      expect(caps.editMetadata).toBe(false);
    });

    it('rejects the real metadata update for the same resolved legacy/current user context', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(catalogActor('admin'));
      (prisma.document.findMany as jest.Mock).mockResolvedValue([ordinaryDocument()]);
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument());
      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        uploadedById: 'owner',
      });

      const caps = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
      expect(caps.editMetadata).toBe(false);
      await expect(
        service.update(1, { description: 'cambio' }, 'catalog', UserRole.USER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('keeps uploader rights but removes legacy ADMIN private-owner bypasses', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'admin', role: UserRole.ADMIN });
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument());
      const admin = (await service.findOne(1, 'admin', UserRole.ADMIN, true)).actionCapabilities;
      expect(admin).toMatchObject({
        editMetadata: false,
        editContent: false,
        move: false,
        trash: false,
        permanentDelete: false,
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'owner', role: UserRole.USER });
      const uploader = (await service.findOne(1, 'owner', UserRole.USER, true)).actionCapabilities;
      expect(uploader).toMatchObject({
        editMetadata: true,
        editContent: true,
        move: true,
        trash: true,
        permanentDelete: true,
      });
    });

    it('does not grant route-or-service authority from an inactive catalog assignment', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(catalogActor('admin', false));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument());

      const caps = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
      expect(caps.permanentDelete).toBe(false);
      expect(caps.editMetadata).toBe(false);
    });

    it('keeps a pending approver content-only despite a pairing catalog RECTOR assignment', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(catalogActor('rector'));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(ordinaryDocument());
      (prisma.workflowApproval.findMany as jest.Mock).mockResolvedValue([
        { workflow: { documentId: 1 } },
      ]);

      const caps = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
      expect(caps.editContent).toBe(true);
      expect(caps.editMetadata).toBe(false);
    });

    it('allows a live reception author with legacy USER and catalog ADMIN to permanent-delete, denying a non-author', async () => {
      const reception = {
        id: 1,
        uploadedById: 'catalog',
        directory: { id: 2, receptionEnabled: true },
        receptionOriginDirectoryId: 2,
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(catalogActor('admin'));
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(reception);
      (prisma.directory.findMany as jest.Mock).mockResolvedValue([
        { id: 2, createdById: 'catalog', receptionEnabled: true },
      ]);
      (prisma.directoryUserParticipant.findMany as jest.Mock).mockResolvedValue([
        { directoryId: 2, peerRead: true },
      ]);

      const author = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
      expect(author).toMatchObject({ scope: 'reception', permanentDelete: true });

      (prisma.document.findFirst as jest.Mock).mockResolvedValue({
        ...reception,
        uploadedById: 'someone',
      });
      const nonAuthor = (await service.findOne(1, 'catalog', UserRole.USER, true)).actionCapabilities;
      expect(nonAuthor.permanentDelete).toBe(false);
    });
  });
});

describe('document lifecycle audit trail', () => {
  const baseVersion = {
    id: 10,
    documentId: 1,
    version: 1,
    filename: 'acta.pdf',
    storedName: 'acta.pdf',
    path: '/storage/acta.pdf',
    mimetype: 'text/plain',
    size: 10,
    checksumSHA256: 'hash',
  };
  const baseDocument = {
    id: 1,
    uploadedById: 'owner',
    categoryId: 99,
    documentTypeId: 12,
    description: 'Acta',
    isPublic: false,
    directoryId: null,
    receptionOriginDirectoryId: null,
    deletedAt: null,
    archivedAt: null,
    currentVersion: 1,
    checksumSHA256: 'hash',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    directory: { id: null, receptionEnabled: false },
  };

  function fixture(
    documentOverrides: Record<string, unknown> = {},
    versionOverrides: Record<string, unknown> = {},
  ) {
    const version = { ...baseVersion, ...versionOverrides };
    const document = {
      ...baseDocument,
      ...documentOverrides,
      versions: [version],
    };
    const db: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        findFirst: jest.fn().mockResolvedValue(document),
        update: jest.fn(async ({ data }: any) => ({ ...document, ...data })),
        create: jest.fn(async ({ data }: any) => ({ ...document, ...data })),
        delete: jest.fn().mockResolvedValue(document),
      },
      documentVersion: {
        findUnique: jest.fn().mockResolvedValue(version),
        findMany: jest.fn().mockResolvedValue([version]),
        update: jest.fn(async ({ data }: any) => ({ ...version, ...data })),
        create: jest.fn(async ({ data }: any) => ({ id: 11, ...data })),
      },
      documentWorkflow: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      workflowApproval: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      documentAccess: { create: jest.fn() },
      documentPermission: { findMany: jest.fn().mockResolvedValue([]) },
      directory: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      documentType: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 12, isActive: true, categoryId: 99 }),
      },
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 99, allowedRoles: [], requiresCourse: false }),
      },
      academicYear: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'owner', role: 'admin', roleAssignments: [] }),
      },
    };
    db.$transaction = jest.fn(async (callback: any) => callback(db));
    const storage: any = {
      generateStructuredPath: jest.fn().mockReturnValue({ path: '/storage/new.pdf' }),
      moveFile: jest.fn(),
      copyFile: jest.fn(),
      deleteFile: jest.fn(),
      calculateFileHash: jest.fn().mockResolvedValue('hash'),
      fileExists: jest.fn().mockReturnValue(true),
      verifyFileIntegrity: jest.fn().mockResolvedValue(true),
    };
    const audit: any = {
      record: jest.fn().mockResolvedValue({}),
      query: jest
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    };
    const directory: any = {
      assertDocumentMutation: jest.fn().mockResolvedValue(false),
      submissionTransaction: jest.fn(async (callback: any) => callback(db)),
      prepareSubmission: jest.fn().mockResolvedValue(null),
      recordSubmission: jest.fn().mockResolvedValue(undefined),
      assertDiscoverable: jest.fn().mockResolvedValue({ id: 7 }),
    };
    const thumbnail = {
      regenerateThumbnail: jest.fn().mockResolvedValue(true),
      deleteThumbnail: jest.fn(),
      generateThumbnail: jest.fn(),
    };
    const numbering = {
      assignNumber: jest.fn().mockResolvedValue('DOC-001'),
      generateNumber: jest.fn().mockResolvedValue('DOC-001'),
    };
    const settings = { getVersionRetentionDays: jest.fn().mockResolvedValue(30) };
    const text = { extractFromFile: jest.fn().mockResolvedValue('texto extraído') };
    const ocr = { enqueue: jest.fn().mockReturnValue('accepted') };
    const service = new DocumentService(
      db,
      storage,
      settings as any,
      thumbnail as any,
      numbering as any,
      directory,
      text as any,
      ocr as any,
      audit,
    );
    return { db, audit, storage, directory, service, document, version };
  }

  const lastAudit = (audit: any) => audit.record.mock.calls.at(-1);

  it('records an upload as CREATE through the submission transaction', async () => {
    const { service, audit, db } = fixture();
    await service.upload(
      {
        originalname: 'acta.pdf',
        mimetype: 'application/pdf',
        path: '/incoming',
        size: 10,
      } as any,
      { description: 'Acta', documentTypeId: 12 } as any,
      'owner',
    );

    const [input, writer] = lastAudit(audit);
    expect(input).toMatchObject({
      action: AuditAction.CREATE,
      resource: AuditResource.DOCUMENT,
      documentId: 1,
    });
    expect(writer).toBe(db);
    expect(input.metadata).toMatchObject({ filename: 'acta.pdf', mimetype: 'application/pdf' });
  });

  it('records a metadata update with whitelisted before/after snapshots in the transaction', async () => {
    const { service, audit, db } = fixture();
    await service.update(
      1,
      { description: 'Nueva descripción', isPublic: true },
      'owner',
      UserRole.ADMIN,
    );

    const [input, writer] = lastAudit(audit);
    expect(input.action).toBe(AuditAction.UPDATE);
    expect(writer).toBe(db);
    expect(input.metadata).toEqual({
      before: {
        description: 'Acta',
        categoryId: 99,
        documentTypeId: 12,
        isPublic: false,
        directoryId: null,
      },
      after: expect.objectContaining({
        description: 'Nueva descripción',
        isPublic: true,
      }),
    });
  });

  it('records an editor save as a content UPDATE without persisting the text', async () => {
    const { service, audit, db } = fixture();
    await service.saveTextContent(1, 'contenido reservado', 'owner', UserRole.ADMIN);

    const [input, writer] = lastAudit(audit);
    expect(input.action).toBe(AuditAction.UPDATE);
    expect(writer).toBe(db);
    expect(JSON.stringify(input.metadata)).not.toContain('contenido reservado');
    expect(input.metadata).toMatchObject({ version: 2, mimetype: 'text/plain' });
  });

  it('records a file replacement as a content UPDATE in the same transaction', async () => {
    const { service, audit, db } = fixture();
    await service.replaceFile(
      1,
      {
        originalname: 'acta.pdf',
        mimetype: 'application/pdf',
        path: '/incoming',
        size: 5,
      } as any,
      'owner',
      UserRole.ADMIN,
    );

    const [input, writer] = lastAudit(audit);
    expect(input.action).toBe(AuditAction.UPDATE);
    expect(writer).toBe(db);
    expect(input.metadata).toMatchObject({ version: 2 });
  });

  it('records trash, permanent deletion, and restores with the lifecycle action', async () => {
    const trashed = fixture();
    await trashed.service.remove(1, 'owner', UserRole.ADMIN);
    expect(lastAudit(trashed.audit)[0].action).toBe(AuditAction.DELETE);
    expect(lastAudit(trashed.audit)[1]).toBe(trashed.db);

    const removed = fixture();
    await removed.service.permanentDelete(1, 'owner', UserRole.ADMIN);
    expect(lastAudit(removed.audit)[0].action).toBe(AuditAction.DELETE);

    const restored = fixture({ deletedAt: new Date('2026-02-01T00:00:00.000Z') });
    await restored.service.restore(1, 'owner', UserRole.ADMIN);
    expect(lastAudit(restored.audit)[0].action).toBe(AuditAction.RESTORE);

    const archived = fixture(
      { archivedAt: new Date('2026-02-01T00:00:00.000Z') },
      { path: '/archive/acta.pdf' },
    );
    await archived.service.restoreFromArchive(1, 'owner', UserRole.ADMIN);
    expect(lastAudit(archived.audit)[0].action).toBe(AuditAction.RESTORE);
  });

  it('records a version restore as a RESTORE event of the document version', async () => {
    const { service, audit } = fixture();
    await service.restoreVersion(1, 1, 'owner', UserRole.ADMIN);

    const [input] = lastAudit(audit);
    expect(input).toMatchObject({
      action: AuditAction.RESTORE,
      resource: AuditResource.DOCUMENT_VERSION,
      documentId: 1,
    });
  });

  it('records view and download reads after the existing access record', async () => {
    const viewer = fixture();
    const viewed = await viewer.service.view(1, 'owner', UserRole.ADMIN);
    expect(lastAudit(viewer.audit)[0].action).toBe(AuditAction.VIEW);
    expect(viewer.db.documentAccess.create).toHaveBeenCalled();
    expect(viewed.path).toBe('/storage/acta.pdf');

    const downloader = fixture();
    await downloader.service.download(1, 'owner', UserRole.ADMIN);
    expect(lastAudit(downloader.audit)[0].action).toBe(AuditAction.DOWNLOAD);
  });

  it('does not write lifecycle or access events for detail or internal metadata reads', async () => {
    const { service, audit, db } = fixture();
    await service.findOne(1, 'owner', UserRole.ADMIN, true);

    await service.findOne(1, 'owner', UserRole.ADMIN);
    expect(audit.record).not.toHaveBeenCalled();
    expect(db.documentAccess.create).not.toHaveBeenCalled();
  });

  it('propagates a mutation audit failure so the transaction rolls back', async () => {
    const { service, audit, db } = fixture();
    audit.record.mockRejectedValue(new Error('audit unavailable'));

    await expect(service.remove(1, 'owner', UserRole.ADMIN)).rejects.toThrow(
      'audit unavailable',
    );
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('never breaks legitimate read access when the audit write fails', async () => {
    const { service, audit } = fixture();
    audit.record.mockRejectedValue(new Error('audit unavailable'));

    await expect(service.download(1, 'owner', UserRole.ADMIN)).resolves.toMatchObject({
      path: '/storage/acta.pdf',
    });
    await expect(service.findOne(1, 'owner', UserRole.ADMIN, true)).resolves.toBeDefined();
  });

  it('never leaks storage paths, bytes, or credentials through lifecycle metadata', async () => {
    const { service, audit } = fixture();
    await service.upload(
      {
        originalname: 'acta.pdf',
        mimetype: 'application/pdf',
        path: '/incoming',
        size: 10,
      } as any,
      { description: 'Acta', documentTypeId: 12 } as any,
      'owner',
    );
    await service.update(1, { description: 'Nueva' }, 'owner', UserRole.ADMIN);
    await service.saveTextContent(1, 'contenido reservado', 'owner', UserRole.ADMIN);
    await service.remove(1, 'owner', UserRole.ADMIN);
    await service.download(1, 'owner', UserRole.ADMIN);

    expect(audit.record).toHaveBeenCalled();
    for (const [input] of audit.record.mock.calls) {
      const payload = JSON.stringify({ metadata: input.metadata ?? null });
      for (const forbidden of [
        '/storage/',
        '/incoming',
        '/archive/',
        'contenido reservado',
        'texto extraído',
        'password',
        'token',
        'http',
      ]) {
        expect(payload).not.toContain(forbidden);
      }
    }
  });

  it('enforces document visibility before querying the audit trail', async () => {
    const { service, audit, db } = fixture();
    db.document.findFirst.mockResolvedValue(null);

    await expect(
      service.getAuditTrail(1, { page: 1, limit: 20 } as any, 'owner', UserRole.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(audit.query).not.toHaveBeenCalled();
  });

  it('returns an empty page when the audit trail has no events', async () => {
    const { service, audit } = fixture();
    audit.query.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 } as any);

    await expect(
      service.getAuditTrail(1, {} as any, 'owner', UserRole.ADMIN),
    ).resolves.toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('allows a secretario owner to query activity', async () => {
    const { service, audit } = fixture();
    jest.spyOn(service, 'findOne').mockResolvedValue({ uploadedById: 'owner' } as any);
    await service.getAuditTrail(1, {} as any, 'owner', UserRole.SECRETARIO);
    expect(audit.query).toHaveBeenCalledWith({ documentId: 1 });
  });

  it('denies a shared nonowner before querying activity', async () => {
    const { service, audit } = fixture();
    jest.spyOn(service, 'findOne').mockResolvedValue({ uploadedById: 'owner' } as any);
    await expect(service.getAuditTrail(1, {} as any, 'reader', UserRole.SECRETARIO))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.query).not.toHaveBeenCalled();
  });

  it('queries the audit trail for the path document with newest-first pagination', async () => {
    const { service, audit } = fixture();
    const page = { data: [{ id: 'audit-1' }], total: 1, page: 2, limit: 5 };
    audit.query.mockResolvedValue(page as any);

    await expect(
      service.getAuditTrail(
        1,
        { page: 2, limit: 5, documentId: 999 } as any,
        'owner',
        UserRole.ADMIN,
      ),
    ).resolves.toEqual(page);
    expect(audit.query).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      documentId: 1,
    });
  });
});
describe('ordinary inherited mutation boundaries', () => {
  function fixture(flags: any = {}) {
    const document: any = { id: 1, uploadedById: 'owner', directoryId: null, receptionOriginDirectoryId: null,
      isPublic: false, currentVersion: 1, categoryId: null,
      versions: [{ id: 10, version: 1, filename: 'a.txt', storedName: 'a.txt', path: '/ordinary/current.txt', mimetype: 'text/plain' }] };
    const grant = { id: 7, documentId: 1, userId: 'recipient', grantedById: 'owner', canView: true,
      canEdit: false, canUploadVersion: false, canShare: false, ...flags };
    const db: any = {
      document: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn(async ({ data }) => ({ ...document, ...data })), delete: jest.fn() },
      effectiveAccessGrant: { findMany: jest.fn().mockResolvedValue([grant]) },
      user: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, role: UserRole.USER })), findMany: jest.fn().mockResolvedValue([{ id: 'owner', name: 'Owner' }]) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) }, workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
      documentVersion: { update: jest.fn(), create: jest.fn(async ({ data }) => ({ id: 11, ...data })) },
      documentAccess: { create: jest.fn() }, $queryRaw: jest.fn(),
    };
    db.$transaction = jest.fn(cb => cb(db));
    const storage: any = { generateStructuredPath: jest.fn().mockReturnValue({ path: '/ordinary/new.txt' }), copyFile: jest.fn(),
      calculateFileHash: jest.fn().mockResolvedValue('hash'), deleteFile: jest.fn() };
    const directory = new DirectoryService(db);
    const service = new DocumentService(db, storage, {} as any, { regenerateThumbnail: jest.fn().mockResolvedValue(true) } as any,
      {} as any, directory, { extractFromFile: jest.fn().mockResolvedValue('text') } as any, { enqueue: jest.fn() } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(document);
    return { service, db, document, storage };
  }
  const file: any = { path: '/ordinary/incoming.txt', originalname: 'a.txt', mimetype: 'text/plain', size: 1 };

  it('metadata permission does not authorize a new version', async () => {
    const { service, db, storage } = fixture({ canEdit: true });
    await expect(service.update(1, { description: 'Allowed metadata' }, 'recipient', UserRole.ADMIN)).resolves.toBeDefined();
    await expect(service.replaceFile(1, file, 'recipient', UserRole.ADMIN)).rejects.toThrow();
    expect(db.document.update).toHaveBeenCalledTimes(1);
    expect(storage.copyFile).not.toHaveBeenCalled();
  });
  it('version permission does not authorize metadata, public visibility or owner deletion', async () => {
    const { service, db } = fixture({ canUploadVersion: true });
    await expect(service.replaceFile(1, file, 'recipient', UserRole.USER)).resolves.toBeDefined();
    await expect(service.update(1, { description: 'Denied' }, 'recipient', UserRole.ADMIN)).rejects.toThrow();
    await expect(service.update(1, { isPublic: true }, 'recipient', UserRole.ADMIN)).rejects.toThrow();
    await expect(service.remove(1, 'recipient', UserRole.ADMIN)).rejects.toThrow('propietario');
    await expect(service.permanentDelete(1, 'recipient', UserRole.ADMIN)).rejects.toThrow('propietario');
    expect(db.document.delete).not.toHaveBeenCalled();
  });
  it('revalidates a revocation under the document lock before version or metadata effects', async () => {
    const { service, db, storage } = fixture({ canEdit: true, canUploadVersion: true });
    db.$queryRaw.mockImplementation(async () => { db.effectiveAccessGrant.findMany.mockResolvedValue([]); });
    await expect(service.update(1, { description: 'Revoked' }, 'recipient', UserRole.USER)).rejects.toThrow();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(storage.copyFile).not.toHaveBeenCalled();
  });
  it('does not use source reading as move authority', async () => {
    const { service, db } = fixture();
    await expect(service.move(1, null, 'recipient', UserRole.ADMIN)).rejects.toThrow();
    expect(db.document.update).not.toHaveBeenCalled();
  });
  it('requires destination upload authority even when source metadata editing is granted', async () => {
    const { service, db } = fixture({ canEdit: true });
    db.directory = { findUnique: jest.fn().mockResolvedValue({ id: 20, createdById: 'other', isPublic: true, receptionEnabled: false }) };
    db.directoryAncestor = { findMany: jest.fn().mockResolvedValue([{ ancestorId: 20, descendantId: 20, depth: 0,
      ancestor: { id: 20, createdById: 'other', isPublic: true, receptionEnabled: false } }]) };
    await expect(service.move(1, 20, 'recipient', UserRole.ADMIN)).rejects.toThrow();
    expect(db.document.update).not.toHaveBeenCalled();
  });
});

describe('transaction-aware correction promotion', () => {
  function fixture() {
    const request: any = { id: 8, documentId: 1, recipientId: 'recipient', status: 'CORRECTION_SUBMITTED', baseVersionId: 12,
      stagedPath: 'private/correction', filename: 'correction.txt', mimetype: 'text/plain', size: 4 };
    const document: any = { id: 1, uploadedById: 'owner', currentVersion: 2, categoryId: null,
      versions: [{ id: 12, version: 2, path: 'original.txt' }] };
    const tx: any = {
      $queryRaw: jest.fn(), documentChangeRequest: { findUnique: jest.fn(async () => request) },
      user: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, role: 'user' })) },
      document: { findUnique: jest.fn(async () => document), update: jest.fn() },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      documentVersion: { update: jest.fn(), create: jest.fn(async ({ data }) => ({ id: 13, ...data })) },
      documentAccess: { create: jest.fn() },
    };
    const storage: any = { readPrivateCorrection: jest.fn(), generateStructuredPath: jest.fn().mockReturnValue({ path: 'new-correction.txt' }),
      copyFile: jest.fn(), calculateFileHash: jest.fn().mockResolvedValue('hash'), deleteFile: jest.fn() };
    const service = new DocumentService(tx, storage, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'assertIndependentPath').mockImplementation(() => {});
    jest.spyOn(service as any, 'extractCurrentText').mockResolvedValue('corrected');
    jest.spyOn(service as any, 'appendLifecycleAudit').mockResolvedValue(undefined);
    return { service, request, document, tx, storage };
  }

  it('promotes metadata and search while preserving the original blob and retention fields', async () => {
    const { service, tx, storage } = fixture();
    const rollback = jest.fn();
    await service.promoteChangeRequestCorrection(tx, 8, 'owner', rollback);
    expect(tx.documentVersion.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { supersededAt: expect.any(Date) } });
    expect(tx.documentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ version: 3, createdById: 'recipient', filename: 'correction.txt', source: 'REEMPLAZO_MANUAL', workflowId: null }) });
    expect(tx.document.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { currentVersion: 3, checksumSHA256: 'hash', search: { upsert: { create: { extractedText: 'corrected' }, update: { extractedText: 'corrected' } } } } });
    expect(storage.deleteFile).not.toHaveBeenCalled();
    rollback.mock.calls[0][0]();
    expect(storage.deleteFile).toHaveBeenCalledWith('new-correction.txt');
  });

  it('rejects unauthorized actors, closed requests and principal drift before file effects', async () => {
    const { service, request, document, tx, storage } = fixture();
    await expect(service.promoteChangeRequestCorrection(tx, 8, 'recipient', jest.fn())).rejects.toThrow('propietario');
    request.status = 'ACCEPTED';
    await expect(service.promoteChangeRequestCorrection(tx, 8, 'owner', jest.fn())).rejects.toThrow('pendiente');
    request.status = 'CORRECTION_SUBMITTED'; document.versions[0].id = 14;
    await expect(service.promoteChangeRequestCorrection(tx, 8, 'owner', jest.fn())).rejects.toThrow('principal');
    expect(storage.copyFile).not.toHaveBeenCalled();
  });

  it('rechecks a request cancelled while waiting for its document lock', async () => {
    const { service, request, tx, storage } = fixture();
    const snapshot = { ...request };
    tx.documentChangeRequest.findUnique.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...request, status: 'CANCELLED' });
    await expect(service.promoteChangeRequestCorrection(tx, 8, 'owner', jest.fn())).rejects.toThrow('pendiente');
    expect(storage.copyFile).not.toHaveBeenCalled();
  });
});
