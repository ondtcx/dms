import { EventEmitter } from 'node:events';
import { fork } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { PdfOcrService, PdfOcrJob, combineOcrText, validatedOcrResult } from './pdf-ocr.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OCR_LIMITS } from './pdf-ocr.engine';

jest.mock('node:child_process', () => ({ fork: jest.fn() }));
const job: PdfOcrJob = {
  documentId: 1, currentVersion: 2, versionRowId: 12,
  checksumSHA256: 'a'.repeat(64), path: 'uploads/current.pdf',
  mimetype: 'application/pdf', digitalText: 'Texto digital',
};
const completed = { status: 'completed', addedText: 'Texto escaneado', pagesProcessed: 2, pagesOcr: 1, capped: false };
const noEnrichment = { status: 'no-enrichment', reason: 'model-unavailable', pagesProcessed: 0, pagesOcr: 0, capped: false };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>(resolve => { resolveValue = resolve; });
  return { promise, resolve: resolveValue };
}
class FakeChild extends EventEmitter {
  send = jest.fn((_request, callback) => callback?.(null));
  kill = jest.fn(() => true);
  finish(result: unknown = completed, code: number | null = 0) {
    this.emit('message', result);
    this.emit('close', code);
  }
}
function database() {
  const order: string[] = [];
  const document: any = {
    id: 1, currentVersion: 2, checksumSHA256: job.checksumSHA256, deletedAt: null,
    versions: [{ id: 12, version: 2, checksumSHA256: job.checksumSHA256, path: job.path, mimetype: job.mimetype }],
    search: { extractedText: 'Texto digital más reciente' },
  };
  const tx = {
    $queryRaw: jest.fn(async () => { order.push('lock'); return []; }),
    document: { findUnique: jest.fn(async () => { order.push('query'); return document; }) },
    documentSearch: { upsert: jest.fn(async (_args: any) => { order.push('upsert'); }) },
  };
  const prisma = { $transaction: jest.fn(async callback => callback(tx)) };
  return { prisma, tx, document, order };
}

describe('PdfOcrService bounded jobs', () => {
  let service: PdfOcrService;
  let db: ReturnType<typeof database>;
  let children: FakeChild[];
  let prepare: jest.SpyInstance;
  let cleanup: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    db = database();
    service = new PdfOcrService(db.prisma as unknown as PrismaService);
    children = [];
    (fork as jest.Mock).mockReset().mockImplementation(() => {
      const child = new FakeChild(); children.push(child); return child;
    });
    prepare = jest.spyOn(service as any, 'prepareSnapshot').mockImplementation(async (input: any) => ({
      directory: `/private/job-${input.documentId}`, inputPath: `/private/job-${input.documentId}/input.pdf`,
    }));
    cleanup = jest.spyOn(service as any, 'cleanupSnapshot').mockResolvedValue(undefined);
  });
  afterEach(async () => {
    const closing = service.onApplicationShutdown();
    for (const child of children) child.emit('close', 1);
    await flush();
    jest.advanceTimersByTime(5_000);
    await closing;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  async function start(input = job) {
    expect(service.enqueue(input)).toBe('accepted');
    jest.runAllTicks(); await flush();
    return children[children.length - 1];
  }

  it('reserves three slots synchronously before any asynchronous preparation', async () => {
    expect(service.enqueue(job)).toBe('accepted');
    expect(service.enqueue(job)).toBe('accepted');
    expect(service.enqueue(job)).toBe('accepted');
    expect(service.enqueue(job)).toBe('skipped');
    expect(prepare).not.toHaveBeenCalled();
    jest.runAllTicks(); await flush();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(1);
  });

  it('keeps FIFO even while the head snapshot is preparing and rejects overflow', async () => {
    const snapshot = deferred<any>();
    prepare.mockImplementationOnce(() => snapshot.promise);
    service.enqueue(job); jest.runAllTicks(); await flush();
    service.enqueue({ ...job, documentId: 2 });
    service.enqueue({ ...job, documentId: 3 });
    expect(service.enqueue({ ...job, documentId: 4 })).toBe('skipped');
    snapshot.resolve({ directory: '/private/first', inputPath: '/private/first/input.pdf' });
    await flush();
    expect(children).toHaveLength(1);
    children[0].finish(noEnrichment); await flush();
    expect(prepare.mock.calls.map(([input]) => input.documentId)).toEqual([1, 2]);
    children[1].finish(noEnrichment); await flush();
    expect(prepare.mock.calls.map(([input]) => input.documentId)).toEqual([1, 2, 3]);
    children[2].finish(noEnrichment); await flush();
    expect(cleanup).toHaveBeenCalledTimes(3);
  });

  it('skips unsupported MIME without reserving or doing filesystem work', () => {
    expect(service.enqueue({ ...job, mimetype: 'text/plain' })).toBe('skipped');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('releases failed snapshots and continues with the next admitted job', async () => {
    prepare.mockRejectedValueOnce(new Error('disk'));
    service.enqueue(job); service.enqueue({ ...job, documentId: 2 });
    jest.runAllTicks(); await flush();
    expect(children).toHaveLength(1);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('expires pending jobs after 120 seconds, without snapshot work', async () => {
    await start(); service.enqueue({ ...job, documentId: 2 });
    jest.advanceTimersByTime(120_000); await flush();
    expect(prepare).toHaveBeenCalledTimes(1);
    children[0].emit('close', 1); await flush();
    expect(children).toHaveLength(1);
    expect(service.enqueue(job)).toBe('accepted');
  });

  it('expires preparation but holds its reservation and cleans late snapshots', async () => {
    const snapshot = deferred<any>(); prepare.mockReturnValueOnce(snapshot.promise);
    service.enqueue(job); jest.runAllTicks(); await flush();
    jest.advanceTimersByTime(120_000); await flush();
    service.enqueue(job); service.enqueue(job);
    expect(service.enqueue(job)).toBe('skipped');
    snapshot.resolve({ directory: '/private/late', inputPath: '/private/late/input.pdf' });
    await flush();
    expect(cleanup).toHaveBeenCalledWith({ directory: '/private/late', inputPath: '/private/late/input.pdf' });
    expect(children).toHaveLength(1);
  });

  it('forks only the adjacent compiled worker and passes the immutable snapshot and local absolute model', async () => {
    const child = await start();
    expect(fork).toHaveBeenCalledWith(join(__dirname, 'pdf-ocr.worker.js'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: ['--max-old-space-size=256'],
    });
    expect(child.send.mock.calls[0][0]).toEqual({ type: 'extract', inputPath: '/private/job-1/input.pdf', modelDirectory: resolve(process.env.OCR_MODEL_DIRECTORY || 'ocr-models') });
    expect(JSON.stringify(child.send.mock.calls[0][0])).not.toContain(job.path);
  });

  it('requires successful closure before publishing and preserves the latest digital baseline', async () => {
    const child = await start(); child.emit('message', completed); await flush();
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
    child.emit('close', 0); await flush();
    expect(db.order).toEqual(['lock', 'query', 'upsert']);
    expect(db.tx.documentSearch.upsert).toHaveBeenCalledWith({
      where: { documentId: 1 },
      create: { documentId: 1, extractedText: 'Texto digital más reciente Texto escaneado' },
      update: { extractedText: 'Texto digital más reciente Texto escaneado' },
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no-enrichment', noEnrichment, 0],
    ['nonzero exit', completed, 1],
    ['signal exit', completed, null],
    ['malformed', { ...completed, extra: true }, 0],
    ['oversized', { ...completed, addedText: 'a'.repeat(OCR_LIMITS.outputBytes + 1) }, 0],
    ['empty enrichment', { ...completed, addedText: '  ' }, 0],
  ])('preserves search on %s and cleans on closure', async (_name, result, code) => {
    const child = await start(); child.finish(result, code); await flush();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('rejects multiple outputs even if each one is valid', async () => {
    const child = await start(); child.emit('message', completed); child.emit('message', completed);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', 0); await flush();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retains capacity and private bytes after timeout or kill errors until actual close', async () => {
    const child = await start(); child.kill.mockImplementation(() => { throw new Error('kill'); });
    service.enqueue(job); service.enqueue(job);
    jest.advanceTimersByTime(60_000); await flush();
    expect(child.kill).toHaveBeenCalled();
    expect(children).toHaveLength(1);
    expect(cleanup).not.toHaveBeenCalled();
    expect(service.enqueue(job)).toBe('skipped');
    child.finish(completed); await flush();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(2);
  });

  it('retains capacity when kill returns false until actual child close', async () => {
    const child = await start(); child.kill.mockReturnValue(false);
    service.enqueue(job); service.enqueue(job);
    jest.advanceTimersByTime(60_000); await flush();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(children).toHaveLength(1);
    expect(cleanup).not.toHaveBeenCalled();
    expect(service.enqueue(job)).toBe('skipped');
    child.finish(completed); await flush();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(2);
  });

  it('handles child error and send failure without falsely releasing an unclosed child', async () => {
    const child = await start(); child.emit('error', new Error('ipc'));
    await flush(); expect(cleanup).not.toHaveBeenCalled();
    child.emit('close', 0); await flush();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retains capacity on failed IPC send until the child closes', async () => {
    (fork as jest.Mock).mockImplementationOnce(() => {
      const child = new FakeChild();
      child.send.mockImplementation((_request, callback) => callback(new Error('send')));
      children.push(child); return child;
    });
    const child = await start();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
    child.emit('error', new Error('kill-error'));
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.emit('close', 0); await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cleans a snapshot if publication fails and continues without clearing search', async () => {
    db.prisma.$transaction.mockRejectedValueOnce(new Error('database'));
    const child = await start(); child.finish(); await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
    expect(service.enqueue(job)).toBe('accepted');
  });

  it('cleans a snapshot if fork throws without a child', async () => {
    (fork as jest.Mock).mockImplementationOnce(() => { throw new Error('spawn'); });
    await start();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(service.enqueue(job)).toBe('accepted');
  });

  it.each([
    ['document checksum', (d: any) => { d.checksumSHA256 = 'b'.repeat(64); }],
    ['version checksum', (d: any) => { d.versions[0].checksumSHA256 = 'b'.repeat(64); }],
    ['current version ABA', (d: any) => { d.currentVersion = 3; }],
    ['version row ABA', (d: any) => { d.versions[0].id = 13; }],
    ['version number', (d: any) => { d.versions[0].version = 3; }],
    ['path identity', (d: any) => { d.versions[0].path = 'uploads/other.pdf'; }],
    ['MIME identity', (d: any) => { d.versions[0].mimetype = 'text/plain'; }],
    ['deleted document', (d: any) => { d.deletedAt = new Date(); }],
    ['missing version', (d: any) => { d.versions = []; }],
  ])('discards stale %s under lock without clearing digital text', async (_name, mutate) => {
    mutate(db.document);
    const child = await start(); child.finish(); await flush();
    expect(db.order).toEqual(['lock', 'query']);
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
  });

  it('discards a version that becomes stale while waiting for the document lock', async () => {
    const lock = deferred<any[]>();
    db.tx.$queryRaw.mockImplementationOnce(async () => {
      db.order.push('lock');
      return lock.promise;
    });
    const child = await start(); child.finish(); await flush();
    expect(db.order).toEqual(['lock']);
    expect(db.tx.document.findUnique).not.toHaveBeenCalled();
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
    db.document.currentVersion = 3;
    lock.resolve([]); await flush();
    expect(db.order).toEqual(['lock', 'query']);
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('preserves digital text updated while waiting for the document lock', async () => {
    const lock = deferred<any[]>();
    db.tx.$queryRaw.mockImplementationOnce(async () => {
      db.order.push('lock');
      return lock.promise;
    });
    const child = await start(); child.finish(); await flush();
    expect(db.order).toEqual(['lock']);
    expect(db.tx.document.findUnique).not.toHaveBeenCalled();
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
    db.document.search.extractedText = 'Texto digital actualizado durante la espera';
    lock.resolve([]); await flush();
    expect(db.order).toEqual(['lock', 'query', 'upsert']);
    expect(db.tx.documentSearch.upsert).toHaveBeenCalledWith({
      where: { documentId: 1 },
      create: { documentId: 1, extractedText: 'Texto digital actualizado durante la espera Texto escaneado' },
      update: { extractedText: 'Texto digital actualizado durante la espera Texto escaneado' },
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('discards physically deleted documents', async () => {
    db.tx.document.findUnique.mockResolvedValueOnce(null);
    const child = await start(); child.finish(); await flush();
    expect(db.order).toEqual(['lock']);
    expect(db.tx.documentSearch.upsert).not.toHaveBeenCalled();
  });

  it('uses expected digital baseline only if the search row has no text', async () => {
    db.document.search = null;
    const child = await start(); child.finish(); await flush();
    expect(db.tx.documentSearch.upsert.mock.calls[0][0].update.extractedText).toBe('Texto digital Texto escaneado');
  });

  it('shutdown cancels pending jobs, terminates active and defers cleanup until closure', async () => {
    const child = await start(); service.enqueue(job); service.enqueue(job);
    const closing = service.onApplicationShutdown();
    expect(service.enqueue(job)).toBe('skipped');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    jest.advanceTimersByTime(5_000); await closing;
    expect(cleanup).not.toHaveBeenCalled();
    child.finish(); await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(1);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('shutdown before the preparation microtask settles all queued reservations without disk work', async () => {
    service.enqueue(job); service.enqueue(job); service.enqueue(job);
    await service.onApplicationShutdown(); jest.runAllTicks(); await flush();
    expect(prepare).not.toHaveBeenCalled();
    expect(children).toHaveLength(0);
    expect(service.enqueue(job)).toBe('skipped');
  });

  it('shutdown while preparing cleans late snapshots and never starts a child', async () => {
    const snapshot = deferred<any>(); prepare.mockReturnValueOnce(snapshot.promise);
    service.enqueue(job); service.enqueue(job); jest.runAllTicks(); await flush();
    const closing = service.onApplicationShutdown(); jest.advanceTimersByTime(5_000); await closing;
    snapshot.resolve({ directory: '/private/late', inputPath: '/private/late/input.pdf' }); await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(0);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
});

describe('OCR result and combined text bounds', () => {
  it.each([
    null, [], { ...completed, pagesProcessed: 21 }, { ...completed, pagesOcr: 3 },
    { ...completed, pagesProcessed: 1.5 }, { ...completed, capped: 'false' },
    { ...noEnrichment, reason: 'arbitrary' }, { ...completed, addedText: 5 },
    { ...completed, status: 'other' }, { ...completed, pagesOcr: -1 },
  ])('rejects invalid IPC %#', value => { expect(validatedOcrResult(value)).toBeNull(); });
  it('accepts both exact bounded protocols', () => {
    expect(validatedOcrResult(completed)).toEqual(completed);
    expect(validatedOcrResult(noEnrichment)).toEqual(noEnrichment);
  });
  it('preserves the exact baseline prefix, removes repeated baseline and caps at a UTF8 boundary', () => {
    const baseline = 'Digital\ntexto';
    expect(combineOcrText(baseline, 'Digital texto')).toBe(baseline);
    expect(combineOcrText(baseline, 'Digital texto añadido')).toBe(`${baseline} añadido`);
    const prefix = 'a'.repeat(OCR_LIMITS.outputBytes - 4);
    const result = combineOcrText(prefix, 'ñññ');
    expect(result.startsWith(prefix)).toBe(true);
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(OCR_LIMITS.outputBytes);
    expect(result).not.toContain('\ufffd');
    expect(combineOcrText('a'.repeat(OCR_LIMITS.outputBytes + 1), 'OCR')).toHaveLength(OCR_LIMITS.outputBytes + 1);
  });
});

describe('private snapshot filesystem ownership', () => {
  const root = resolve('.tmp/basic-search-ocr');
  let fixture: string;
  let service: PdfOcrService;
  let input: PdfOcrJob;
  beforeEach(async () => {
    await fs.mkdir(root, { recursive: true });
    fixture = await fs.mkdtemp(join(root, 'probe-'));
    const path = join(fixture, 'source.pdf');
    const bytes = Buffer.from('%PDF-1.4 synthetic bytes');
    await fs.writeFile(path, bytes, { flag: 'wx' });
    input = { ...job, path, checksumSHA256: createHash('sha256').update(bytes).digest('hex') };
    service = new PdfOcrService({} as PrismaService);
  });
  afterEach(async () => {
    for (const name of await fs.readdir(fixture)) await fs.unlink(join(fixture, name));
    await fs.rmdir(fixture);
  });
  it('creates an exclusively owned exact copy, never removes source or neighboring files', async () => {
    const snapshot = await (service as any).prepareSnapshot(input);
    expect(snapshot.directory.startsWith(join(root, 'jobs', 'job-'))).toBe(true);
    expect(await fs.readFile(snapshot.inputPath)).toEqual(await fs.readFile(input.path));
    await fs.writeFile(input.path, 'changed storage bytes');
    expect((await fs.readFile(snapshot.inputPath)).toString()).toBe('%PDF-1.4 synthetic bytes');
    if (process.platform !== 'win32') {
      expect((await fs.stat(snapshot.directory)).mode & 0o777).toBe(0o700);
      expect((await fs.stat(snapshot.inputPath)).mode & 0o777).toBe(0o600);
    }
    await (service as any).cleanupSnapshot(snapshot);
    await expect(fs.stat(snapshot.directory)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await fs.readFile(input.path)).toString()).toBe('changed storage bytes');
    expect((await fs.stat(join(root, 'baseline-t2'))).isDirectory()).toBe(true);
  });
  it('rejects checksum mismatches before creating a private job', async () => {
    await expect((service as any).prepareSnapshot({ ...input, checksumSHA256: 'b'.repeat(64) })).rejects.toThrow('checksum-mismatch');
  });
  it('rejects oversized regular files before opening/copying bytes', async () => {
    await fs.truncate(input.path, OCR_LIMITS.inputBytes + 1);
    await expect((service as any).prepareSnapshot(input)).rejects.toThrow('unsafe-input');
  });
  it('rejects symlinks when the OS permits creating them', async () => {
    const link = join(fixture, 'link.pdf');
    try { await fs.symlink(input.path, link); }
    catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code!)) return;
      throw error;
    }
    await expect((service as any).prepareSnapshot({ ...input, path: link })).rejects.toThrow('unsafe-input');
  });
  it('cleans exclusive directory after a write failure', async () => {
    const write = jest.spyOn(require('node:fs/promises'), 'writeFile').mockRejectedValueOnce(new Error('disk'));
    const cleanup = jest.spyOn(service as any, 'cleanupSnapshot');
    await expect((service as any).prepareSnapshot(input)).rejects.toThrow('disk');
    expect(cleanup).toHaveBeenCalledTimes(1);
    await expect(fs.stat((cleanup.mock.calls[0][0] as any).directory)).rejects.toMatchObject({ code: 'ENOENT' });
    write.mockRestore(); cleanup.mockRestore();
  });
});
