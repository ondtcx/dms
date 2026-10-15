import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ChildProcess, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeText, OCR_LIMITS, OcrResult } from './pdf-ocr.engine';

export interface PdfOcrJob {
  documentId: number;
  currentVersion: number;
  versionRowId: number;
  checksumSHA256: string;
  path: string;
  mimetype: string;
  digitalText: string | null;
}

const QUEUE_WAIT_MS = 120_000;
const CHILD_DEADLINE_MS = 60_000;
const SHUTDOWN_WAIT_MS = 5_000;
interface PendingJob { input: PdfOcrJob; expires: ReturnType<typeof setTimeout>; cancelled: boolean }
interface Snapshot { inputPath: string; directory: string }

export function validatedOcrResult(value: unknown): OcrResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const keys = result.status === 'completed'
    ? ['status', 'addedText', 'pagesProcessed', 'pagesOcr', 'capped']
    : ['status', 'reason', 'pagesProcessed', 'pagesOcr', 'capped'];
  if (Object.keys(result).length !== keys.length || Object.keys(result).some(key => !keys.includes(key))) return null;
  if (!Number.isInteger(result.pagesProcessed) || (result.pagesProcessed as number) < 0 || (result.pagesProcessed as number) > OCR_LIMITS.pages ||
      !Number.isInteger(result.pagesOcr) || (result.pagesOcr as number) < 0 || (result.pagesOcr as number) > (result.pagesProcessed as number) || typeof result.capped !== 'boolean') return null;
  if (result.status === 'completed') {
    if (typeof result.addedText !== 'string' || Buffer.byteLength(result.addedText) > OCR_LIMITS.outputBytes) return null;
  } else if (result.status !== 'no-enrichment' || !['no-added-text', 'processing-failed', 'invalid-input', 'model-unavailable', 'invalid-request'].includes(result.reason as string)) return null;
  return value as OcrResult;
}

export function combineOcrText(baseline: string, enrichment: string): string {
  const digital = normalizeText(baseline);
  // Nunca se recorta un texto digital existente para introducir OCR.
  if (Buffer.byteLength(baseline) > OCR_LIMITS.outputBytes) return baseline;
  let added = normalizeText(enrichment);
  if (!added || digital.includes(added)) return baseline;
  if (digital) added = normalizeText(added.split(digital).join(' '));
  if (!added) return baseline;
  // Se conserva el prefijo exacto de la extracción digital ya publicada.
  const suffix = normalizeText(added, Math.max(0, OCR_LIMITS.outputBytes - Buffer.byteLength(baseline) - (baseline ? 1 : 0)));
  return suffix ? `${baseline}${baseline ? ' ' : ''}${suffix}` : baseline;
}

@Injectable()
export class PdfOcrService implements OnApplicationShutdown {
  private readonly logger = new Logger(PdfOcrService.name);
  private readonly queue: PendingJob[] = [];
  private accepting = true;
  private active: PendingJob | null = null;
  private running: Promise<void> | null = null;
  private terminateChild: (() => void) | null = null;

  constructor(private readonly prisma: PrismaService) {}

  enqueue(input: PdfOcrJob): 'accepted' | 'skipped' {
    if (!this.accepting || input.mimetype !== 'application/pdf' || !/^[a-f0-9]{64}$/i.test(input.checksumSHA256) ||
        this.queue.length + (this.active ? 1 : 0) >= 3) return 'skipped';
    const pending: PendingJob = {
      input: { ...input }, cancelled: false,
      expires: setTimeout(() => this.expire(pending), QUEUE_WAIT_MS),
    };
    this.queue.push(pending);
    // La reserva precede cualquier acceso al disco o creación del proceso.
    queueMicrotask(() => this.pump());
    return 'accepted';
  }

  private expire(job: PendingJob): void {
    job.cancelled = true;
    const index = this.queue.indexOf(job);
    if (index >= 0) this.queue.splice(index, 1);
    // Una preparación activa conserva su reserva hasta cerrar sus recursos.
  }

  private pump(): void {
    if (this.active || !this.accepting) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    this.running = this.run(job).finally(() => {
      clearTimeout(job.expires);
      this.active = null;
      this.running = null;
      this.pump();
    });
  }

  private async run(job: PendingJob): Promise<void> {
    let snapshot: Snapshot | undefined;
    try {
      snapshot = await this.prepareSnapshot(job.input);
      clearTimeout(job.expires);
      if (job.cancelled || !this.accepting) return;
      const result = await this.extract(snapshot.inputPath);
      if (this.accepting && !job.cancelled && result?.status === 'completed' && result.addedText.trim()) {
        await this.publish(job.input, result.addedText);
      }
    } catch {
      this.logger.warn('Se omitió el enriquecimiento OCR; se conserva el texto digital.');
    } finally {
      if (snapshot) await this.cleanupSnapshot(snapshot);
    }
  }

  private async ensureOwnedDirectory(path: string): Promise<void> {
    const parent = dirname(path);
    if (parent !== path) {
      try {
        const stat = await fs.lstat(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(await fs.realpath(parent)) !== resolve(parent)) throw new Error('unsafe-root');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await this.ensureOwnedDirectory(parent);
      }
    }
    try { await fs.mkdir(path, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(await fs.realpath(path)) !== resolve(path)) throw new Error('unsafe-root');
    if (process.platform !== 'win32') await fs.chmod(path, 0o700);
  }

  private async prepareSnapshot(input: PdfOcrJob): Promise<Snapshot> {
    const source = resolve(input.path);
    const original = await fs.lstat(source);
    if (!original.isFile() || original.isSymbolicLink() || original.size > OCR_LIMITS.inputBytes || resolve(await fs.realpath(source)) !== source) throw new Error('unsafe-input');
    const handle = await fs.open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    let bytes: Buffer;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== original.dev || opened.ino !== original.ino || opened.size > OCR_LIMITS.inputBytes) throw new Error('changed-input');
      const buffer = Buffer.alloc(OCR_LIMITS.inputBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total > OCR_LIMITS.inputBytes) throw new Error('oversized-input');
      bytes = buffer.subarray(0, total);
      if (createHash('sha256').update(bytes).digest('hex') !== input.checksumSHA256.toLowerCase()) throw new Error('checksum-mismatch');
    } finally { await handle.close(); }
    const root = resolve('.tmp/basic-search-ocr/jobs');
    await this.ensureOwnedDirectory(root);
    const directory = await fs.mkdtemp(join(root, 'job-'));
    const snapshot = { directory, inputPath: join(directory, 'input.pdf') };
    try {
      if (process.platform !== 'win32') await fs.chmod(directory, 0o700);
      await fs.writeFile(snapshot.inputPath, bytes, { flag: 'wx', mode: 0o600 });
      return snapshot;
    } catch (error) {
      await this.cleanupSnapshot(snapshot);
      throw error;
    }
  }

  private async cleanupSnapshot(snapshot: Snapshot): Promise<void> {
    // Solo se eliminan el archivo y directorio exclusivos de esta instancia.
    try { await fs.unlink(snapshot.inputPath); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.warn('No se pudo retirar una copia privada OCR.'); }
    try { await fs.rmdir(snapshot.directory); }
    catch { this.logger.warn('No se pudo retirar un directorio privado OCR.'); }
  }

  private extract(inputPath: string): Promise<OcrResult | null> {
    return new Promise((resolveResult, reject) => {
      let child: ChildProcess;
      try {
        child = fork(join(__dirname, 'pdf-ocr.worker.js'), [], {
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          execArgv: ['--max-old-space-size=256'],
        });
      } catch (error) { reject(error); return; }
      let received = false;
      let invalid = false;
      let result: OcrResult | null = null;
      let terminationAttempted = false;
      const terminate = () => {
        invalid = true;
        if (terminationAttempted) return;
        terminationAttempted = true;
        try { child.kill('SIGKILL'); }
        catch { this.logger.warn('No se pudo terminar el proceso OCR; se conserva su reserva.'); }
      };
      this.terminateChild = terminate;
      const deadline = setTimeout(terminate, CHILD_DEADLINE_MS);
      child.on('message', (message: unknown) => {
        if (received) { terminate(); return; }
        received = true;
        result = validatedOcrResult(message);
        if (!result) terminate();
      });
      child.on('error', terminate);
      child.once('close', (code) => {
        clearTimeout(deadline);
        this.terminateChild = null;
        resolveResult(!invalid && code === 0 && received ? result : null);
      });
      try {
        child.send({ type: 'extract', inputPath, modelDirectory: resolve(process.env.OCR_MODEL_DIRECTORY || 'ocr-models') }, error => {
          if (error) terminate();
        });
      } catch { terminate(); }
    });
  }

  private async publish(input: PdfOcrJob, addedText: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${input.documentId} FOR UPDATE`;
      const document = await tx.document.findUnique({
        where: { id: input.documentId },
        include: { versions: { where: { version: input.currentVersion } }, search: true },
      });
      const version = document?.versions[0];
      if (!this.accepting || !document || document.deletedAt || document.currentVersion !== input.currentVersion ||
          document.checksumSHA256 !== input.checksumSHA256 || !version || version.id !== input.versionRowId ||
          version.version !== input.currentVersion || version.checksumSHA256 !== input.checksumSHA256 ||
          resolve(version.path) !== resolve(input.path) || version.mimetype !== input.mimetype) return;
      const baseline = document.search?.extractedText ?? input.digitalText ?? '';
      const combined = combineOcrText(baseline, addedText);
      if (combined === baseline) return;
      await tx.documentSearch.upsert({
        where: { documentId: input.documentId },
        create: { documentId: input.documentId, extractedText: combined },
        update: { extractedText: combined },
      });
    }, { timeout: 5_000, maxWait: 2_000 });
  }

  async onApplicationShutdown(): Promise<void> {
    this.accepting = false;
    for (const job of this.queue.splice(0)) { job.cancelled = true; clearTimeout(job.expires); }
    if (this.active) { this.active.cancelled = true; clearTimeout(this.active.expires); }
    this.terminateChild?.();
    if (!this.running) return;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.running,
      new Promise<void>(resolveWait => { deadline = setTimeout(resolveWait, SHUTDOWN_WAIT_MS); }),
    ]);
    clearTimeout(deadline);
    if (this.running) this.logger.warn('El cierre OCR sigue pendiente; la limpieza se difiere hasta cerrar sus recursos.');
  }
}
