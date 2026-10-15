import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface ReceptionFileDatabase {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
  receptionSubmission: { findFirst(args: any): Promise<unknown> };
  document: { findFirst(args: any): Promise<unknown> };
}

// La misma normalización textual existe en SQL; nunca infiere una raíz física.
export function normalizeStoredPath(value: string): string {
  const raw = value.replace(/\\/g, '/');
  const absolute = raw.startsWith('/') || /^[A-Za-z]:\//.test(raw);
  const parts: string[] = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      const previous = parts[parts.length - 1];
      if (previous && previous !== '..' && !(absolute && parts.length === 1 && /^[A-Za-z]:$/.test(previous))) {
        parts.pop();
      } else if (!absolute) parts.push(part);
    } else parts.push(part);
  }
  let key = (raw.startsWith('/') ? '/' : '') + parts.join('/');
  if (absolute && parts.length === 1 && /^[A-Za-z]:$/.test(parts[0])) key += '/';
  return key || (absolute ? '/' : '.');
}

export function candidatePathKeys(
  root: string,
  relative: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const api = platform === 'win32' ? path.win32 : path.posix;
  const absolute = api.resolve(root, relative);
  const values = [relative, `uploads/${relative}`, `./uploads/${relative}`, absolute];
  if (platform === 'win32' && /^[A-Za-z]:/.test(absolute)) {
    // Una ruta POSIX absoluta en Windows usa la raíz de la unidad actual.
    values.push(absolute.slice(2));
  }
  return [...new Set(values.map(normalizeStoredPath).map(
    (value) => platform === 'win32' ? value.toLowerCase() : value,
  ))];
}

// Los absolutos de raíces anteriores requieren migración explícita de rutas.
// No se reconstruyen huérfanos previos ni nombres de alias históricos desconocidos.
export class ReceptionFilePolicy {
  private readonly root: string;

  constructor(
    private readonly database: ReceptionFileDatabase,
    root = path.join(process.cwd(), 'uploads'),
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.root = path.resolve(root);
  }

  private relativeInside(root: string, file: string): string {
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('Ruta fuera del almacenamiento publicado');
    }
    return relative.replace(/\\/g, '/');
  }

  private async lookup(keys: string[]): Promise<boolean> {
    const hashes = keys.map((key) => createHash('md5').update(key).digest('hex'));
    const folded = this.platform === 'win32';
    const registryKey = folded ? Prisma.sql`p."foldedKey"` : Prisma.sql`p."normalizedKey"`;
    const registryHash = folded ? Prisma.sql`p."foldedHash"` : Prisma.sql`p."normalizedHash"`;
    // "Document" no almacena rutas: sólo "DocumentVersion.path" conserva la ruta real de cada versión.
    const versionKey = folded
      ? Prisma.sql`lower("reception_file_key"(v.path))`
      : Prisma.sql`"reception_file_key"(v.path)`;
    const result = await this.database.$queryRaw(Prisma.sql`
      SELECT (
        EXISTS (SELECT 1 FROM "ProtectedReceptionFile" p
          WHERE ${registryHash} IN (${Prisma.join(hashes)}) AND ${registryKey} IN (${Prisma.join(keys)}))
        OR EXISTS (SELECT 1 FROM "DocumentVersion" v JOIN "Document" d ON d.id = v."documentId"
          LEFT JOIN "Directory" f ON f.id = d."directoryId"
          WHERE md5(${versionKey}) IN (${Prisma.join(hashes)}) AND ${versionKey} IN (${Prisma.join(keys)})
          AND (d."receptionOriginDirectoryId" IS NOT NULL OR f."receptionEnabled" = TRUE))
      ) AS denied
    `);
    if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.denied !== 'boolean') {
      throw new Error('No se pudo verificar la protección del archivo');
    }
    return result[0].denied;
  }

  private async thumbnailDenied(relative: string): Promise<boolean> {
    // Familia numérica conocida; no se atribuyen esquemas históricos desconocidos.
    const match = /^thumbnails\/thumb_(?:content_v\d+_)?(\d+)\.jpg$/.exec(
      this.platform === 'win32' ? relative.toLowerCase() : relative,
    );
    if (!match) return false;
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return true;
    if (await this.database.receptionSubmission.findFirst({
      where: { documentId: id }, select: { documentId: true },
    })) return true;
    const historical = await this.database.$queryRaw(Prisma.sql`
      SELECT EXISTS (SELECT 1 FROM "ProtectedReceptionFile" WHERE "documentId" = ${id}) AS denied
    `);
    if (!Array.isArray(historical) || historical.length !== 1 || typeof historical[0]?.denied !== 'boolean') {
      throw new Error('No se pudo verificar el historial de la miniatura');
    }
    if (historical[0].denied) return true;
    return !!await this.database.document.findFirst({
      where: { id, OR: [
        { receptionOriginDirectoryId: { not: null } },
        { directory: { is: { receptionEnabled: true } } },
      ] }, select: { id: true },
    });
  }

  async denies(rawPath: string): Promise<boolean> {
    try {
      // Express decodifica una sola vez. Una segunda decodificación cambiaría la identidad.
      const decoded = decodeURIComponent(rawPath.split('?')[0]);
      if (decoded.includes('\0') || decoded.includes('\\') ||
        (this.platform === 'win32' && decoded.includes(':'))) return true;
      const relative = decoded.replace(/^\//, '');
      if (relative.startsWith('/') || relative.split('/').some((part) => part === '..')) return true;
      const rootIndex = path.join(this.root, 'index.html');
      const resolved = path.resolve(this.root, relative);
      const file = resolved === this.root ? rootIndex : resolved;
      this.relativeInside(this.root, file);
      const candidates = new Set([file]);
      const isFile = async (candidate: string): Promise<boolean> => {
        try { return (await fs.stat(candidate)).isFile(); }
        catch (error) {
          if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
          throw error;
        }
      };
      let directory = false;
      let regularFile = false;
      try {
        const stats = await fs.stat(file);
        directory = stats.isDirectory();
        regularFile = stats.isFile();
      }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      }
      if (directory) {
        // express.static publica index.html en directorios; el render de Nest usa el índice raíz.
        const directoryIndex = path.join(file, 'index.html');
        candidates.add(directoryIndex);
        if (!await isFile(directoryIndex)) candidates.add(rootIndex);
      } else if (!regularFile) candidates.add(rootIndex);
      if (relative.split('/').some((part) => part.startsWith('.') && part !== '.')) {
        // Los dotfiles ignorados por Express también pueden llegar al render del índice raíz.
        candidates.add(rootIndex);
      }
      const aliases: Array<{ root: string; relative: string }> = [];
      const targets: Array<{ candidate: string; real: string }> = [];
      let realRoot: string | undefined;
      try { realRoot = await fs.realpath(this.root); }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      }
      for (const candidate of candidates) {
        aliases.push({ root: this.root, relative: this.relativeInside(this.root, candidate) });
        if (!realRoot) continue;
        try {
          const real = await fs.realpath(candidate);
          aliases.push({ root: realRoot, relative: this.relativeInside(realRoot, real) });
          targets.push({ candidate, real });
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        }
      }
      const keys = [...new Set(aliases.flatMap((alias) =>
        candidatePathKeys(alias.root, alias.relative, this.platform),
      ))];
      if (await this.lookup(keys)) return true;
      for (const alias of aliases) {
        if (await this.thumbnailDenied(alias.relative)) return true;
      }
      // Rechaza cambios de destino durante la consulta; no hay caché positiva de acceso.
      for (const target of targets) {
        if (await fs.realpath(target.candidate) !== target.real) return true;
      }
      return false;
    } catch {
      // La falta de BD, errores de ruta o enlaces inaccesibles nunca habilitan publicación.
      return true;
    }
  }
}
