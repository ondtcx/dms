import { CleanupService } from './cleanup.service';
import { SettingsService } from '../settings/settings.service';
import * as fs from 'fs';
import { resolve } from 'path';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  realpathSync: jest.fn((path: string) => require('path').resolve(path)),
  statSync: jest.fn((path: string) => ({
    dev: 1,
    ino: Array.from(require('path').resolve(path) as string).reduce((hash: number, char: string) => (hash * 31 + char.charCodeAt(0)) >>> 0, 1),
    isFile: () => true,
  })),
}));

 describe('daily version retention cleanup', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  let prisma: any;
  let storage: any;
  let service: CleanupService;
  const version = { id: 10, documentId: 1, version: 1, path: '/old', supersededAt: new Date('2026-05-02'), retentionGraceUntil: null, preservePermanently: false, preserveUntil: null, workflowId: null, approvals: [], workflowExecutions: [], workflowTransitions: [] };
  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockImplementation(async (query) => query.join('').includes('SystemSettings') ? [{ id: 1 }] : []).mockResolvedValueOnce([version]),
      $executeRaw: jest.fn().mockResolvedValue(0),
      academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
      systemSettings: { findUnique: jest.fn().mockResolvedValue({ documents: { versionRetentionDays: 30 } }) },
      document: { findUnique: jest.fn().mockResolvedValue({ id: 1, currentVersion: 2, deletedAt: null }) },
      documentVersion: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(version), delete: jest.fn().mockResolvedValue(version), count: jest.fn().mockResolvedValue(0) },
    };
    prisma.$transaction = jest.fn(async (callback) => callback(prisma));
    storage = { fileExists: jest.fn().mockReturnValue(true), deleteFile: jest.fn() };
    service = new CleanupService(prisma, storage, new SettingsService(prisma));
    (service as any).isReady = true;
  });
  const run = () => (service as any).cleanDocumentVersions(now);
  it('reads at most 100 candidates and locks/rechecks before deletion; unlinks after commit', async () => {
    let committed = false;
    prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(prisma);
      if (!committed) expect(storage.deleteFile).not.toHaveBeenCalled();
      committed = true;
      return result;
    });
    storage.deleteFile.mockImplementation(() => expect(committed).toBe(true));
    await run();
    const query = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(query).toContain('LIMIT 100');
    expect(query).toContain('ORDER BY v."supersededAt" ASC, v.id ASC');
    expect(query).toContain('v.version <> d."currentVersion"');
    expect(query).toContain('NOT EXISTS');
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.documentVersion.delete.mock.invocationCallOrder[0]);
    expect(prisma.documentVersion.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(storage.deleteFile).toHaveBeenCalledWith('/old');
    expect(prisma.$executeRaw.mock.calls[0][0].join('')).toContain('LOCK TABLE "DocumentVersion" IN SHARE MODE');
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.documentVersion.findMany.mock.invocationCallOrder[0]);
  });
  it.each([
    { version: 2 }, { preservePermanently: true }, { preserveUntil: new Date('2026-07-01') },
    { retentionGraceUntil: new Date('2026-07-01') }, { supersededAt: null },
    { workflowId: 1 }, { approvals: [{}] }, { workflowExecutions: [{}] }, { workflowTransitions: [{}] },
  ])('rechecks locked version protection %j', async (patch) => {
    prisma.documentVersion.findUnique.mockResolvedValue({ ...version, ...patch });
    await run();
    expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('rechecks a policy extension after candidate selection under the settings lock', async () => {
    prisma.systemSettings.findUnique.mockResolvedValueOnce({ documents: { versionRetentionDays: 30 } }).mockResolvedValue({ documents: { versionRetentionDays: 365 } });
    await run();
    expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
    const queries = prisma.$queryRaw.mock.calls.map((call) => call[0].join(''));
    const settingsLock = queries.findIndex((sql) => sql.includes('SystemSettings') && sql.includes('FOR SHARE'));
    const documentLock = queries.findIndex((sql) => sql.includes('FROM "Document"') && sql.includes('FOR UPDATE'));
    expect(settingsLock).toBeGreaterThan(0);
    expect(settingsLock).toBeLessThan(documentLock);
    expect(prisma.systemSettings.findUnique.mock.invocationCallOrder[1]).toBeGreaterThan(prisma.$queryRaw.mock.invocationCallOrder[settingsLock]);
    expect(prisma.systemSettings.findUnique.mock.invocationCallOrder[1]).toBeLessThan(prisma.$queryRaw.mock.invocationCallOrder[documentLock]);
  });
  it('skips deletion when a settings row cannot be locked', async () => {
    prisma.$queryRaw.mockImplementation(async () => []);
    await run();
    expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('skips policy corruption that occurs after candidate selection', async () => {
    prisma.systemSettings.findUnique.mockResolvedValueOnce({ documents: { versionRetentionDays: 30 } }).mockResolvedValue({ documents: { versionRetentionDays: '30' } });
    await run();
    expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it.each([null, '30', 0, 3651])('skips malformed authoritative policy %j', async (value) => {
    prisma.systemSettings.findUnique.mockResolvedValue({ documents: { versionRetentionDays: value } });
    const warning = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    await run();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
  });
  it('retains surviving physical aliases rather than testing literal path equality', async () => {
    prisma.documentVersion.findUnique.mockResolvedValue({ ...version, path: './uploads/active/file' });
    prisma.documentVersion.findMany.mockResolvedValue([{ path: 'uploads/active/file' }]);
    await run();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('unlinks a proven distinct blob even when other versions survive', async () => {
    prisma.documentVersion.findMany.mockResolvedValue([{ path: '/distinct' }]);
    await run();
    expect(storage.deleteFile).toHaveBeenCalledWith('/old');
  });
  it('retains a symlink alias using resolved physical identity', async () => {
    prisma.documentVersion.findMany.mockResolvedValue([{ path: '/symlink' }]);
    jest.mocked(fs.realpathSync).mockImplementationOnce(() => resolve('/old')).mockImplementationOnce(() => resolve('/old'));
    await run();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('retains when a surviving path cannot be resolved', async () => {
    prisma.documentVersion.findMany.mockResolvedValue([{ path: '/unreadable' }]);
    jest.mocked(fs.realpathSync).mockImplementationOnce(() => resolve('/old')).mockImplementationOnce(() => { throw new Error('unreadable'); });
    await run();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('retains blobs when the bounded global inventory overflows', async () => {
    prisma.documentVersion.findMany.mockResolvedValue(Array.from({ length: 1001 }, () => ({ path: '/other' })));
    await run();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('rechecks trash state under lock', async () => {
    prisma.document.findUnique.mockResolvedValue({ currentVersion: 2, deletedAt: now });
    await run();
    expect(prisma.documentVersion.delete).not.toHaveBeenCalled();
  });
  it('never unlinks on failed commit', async () => {
    prisma.$transaction.mockImplementation(async (callback) => { await callback(prisma); throw new Error('commit failed'); });
    await expect(run()).rejects.toThrow('commit failed');
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('never unlinks blobs referenced by any surviving version, including another document current version', async () => {
    prisma.documentVersion.findMany.mockResolvedValue([{ path: '/old' }]);
    await run();
    expect(prisma.documentVersion.findMany).toHaveBeenCalledWith({ select: { path: true }, take: 1001, orderBy: { id: 'asc' } });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('fails closed on reference lookup failure after commit', async () => {
    prisma.documentVersion.findMany.mockRejectedValue(new Error('lookup failed'));
    await run();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('never unlinks if the global reference guard cannot acquire its lock', async () => {
    prisma.$executeRaw.mockRejectedValue(new Error('lock unavailable'));
    await run();
    expect(prisma.documentVersion.delete).toHaveBeenCalled();
    expect(prisma.documentVersion.findMany).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('logs unlink failures without undoing committed database deletion', async () => {
    storage.deleteFile.mockImplementation(() => { throw new Error('unlink failed'); });
    const log = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    await run();
    expect(log).toHaveBeenCalled();
    expect(prisma.documentVersion.delete).toHaveBeenCalled();
  });
  it('propagates database candidate failures without any filesystem mutation', async () => {
    prisma.$queryRaw.mockReset().mockRejectedValue(new Error('database unavailable'));
    await expect(run()).rejects.toThrow('database unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
  it('filters all protections before the bounded read to avoid protected-row starvation', async () => {
    await run();
    const query = prisma.$queryRaw.mock.calls[0][0].join('');
    for (const name of ['deletedAt', 'currentVersion', 'preservePermanently', 'preserveUntil', 'retentionGraceUntil', 'supersededAt', 'workflowId', 'DocumentWorkflow', 'WorkflowApproval', 'WorkflowTransition']) {
      expect(query.indexOf(name)).toBeLessThan(query.indexOf('LIMIT 100'));
      expect(query).toContain(name);
    }
  });
  it('does nothing before module readiness', async () => {
    (service as any).isReady = false;
    await run();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('preserves reviewed and correction versions by filtering their workflow relations before the bounded read', async () => {
    await run();
    const query = prisma.$queryRaw.mock.calls[0][0].join('');
    // La corrección queda protegida por su workflowId no nulo.
    expect(query).toContain('v."workflowId" IS NULL');
    // La versión revisada queda protegida por sus referencias de workflow, aprobación
    // y transición, y esos filtros preceden al límite del lote, nunca lo suceden.
    expect(query).toContain('NOT EXISTS (SELECT 1 FROM "DocumentWorkflow" w WHERE w."documentVersionId" = v.id)');
    expect(query).toContain('NOT EXISTS (SELECT 1 FROM "WorkflowApproval" a WHERE a."documentVersionId" = v.id)');
    expect(query).toContain('NOT EXISTS (SELECT 1 FROM "WorkflowTransition" t WHERE t."documentVersionId" = v.id)');
    const limit = query.indexOf('LIMIT 100');
    expect(limit).toBeGreaterThan(-1);
    expect(query.indexOf('v."workflowId" IS NULL')).toBeLessThan(limit);
    expect(query.indexOf('"DocumentWorkflow" w WHERE w."documentVersionId"')).toBeLessThan(limit);
    expect(query.indexOf('"WorkflowApproval" a WHERE a."documentVersionId"')).toBeLessThan(limit);
    expect(query.indexOf('"WorkflowTransition" t WHERE t."documentVersionId"')).toBeLessThan(limit);
  });
});
