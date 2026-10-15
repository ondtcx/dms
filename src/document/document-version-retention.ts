import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { realpathSync, statSync } from 'fs';
import { posix, win32 } from 'path';

export const DEFAULT_VERSION_RETENTION_DAYS = 30;
export const DAY_MS = 86_400_000;

export function versionRetentionDays(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3650
    ? value : DEFAULT_VERSION_RETENTION_DAYS;
}

// Solo la ausencia de configuración usa el valor predeterminado; un valor
// presente malformado no autoriza ninguna eliminación automática.
export function authoritativeRetentionDays(documents: unknown): number | null {
  if (documents == null) return DEFAULT_VERSION_RETENTION_DAYS;
  if (typeof documents !== 'object' || Array.isArray(documents)) return null;
  if (!Object.prototype.hasOwnProperty.call(documents, 'versionRetentionDays')) return DEFAULT_VERSION_RETENTION_DAYS;
  const value = (documents as { versionRetentionDays: unknown }).versionRetentionDays;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3650 ? value : null;
}

type BlobIdentityReader = {
  realpath: (path: string) => string;
  stat: (path: string) => { dev: number; ino: number; isFile(): boolean };
};

// Una identidad incierta conserva el archivo, incluso si su registro ya expiró.
export function canUnlinkVersionBlob(
  target: string,
  survivingPaths: string[],
  platform: string = process.platform,
  filesystem: BlobIdentityReader = { realpath: realpathSync, stat: statSync },
): boolean {
  try {
    const paths = platform === 'win32' ? win32 : posix;
    const normalize = (path: string) => {
      if (typeof path !== 'string' || !path.trim()) throw new Error('Ruta desconocida');
      const absolute = paths.resolve(path);
      return platform === 'win32' ? absolute.toLowerCase() : absolute;
    };
    const targetPath = normalize(target);
    const targetReal = normalize(filesystem.realpath(target));
    const targetStat = filesystem.stat(target);
    const known = (stat: ReturnType<BlobIdentityReader['stat']>) => stat.isFile() &&
      Number.isSafeInteger(stat.dev) && stat.dev >= 0 && Number.isSafeInteger(stat.ino) && stat.ino > 0;
    if (!known(targetStat)) return false;
    for (const path of survivingPaths) {
      if (normalize(path) === targetPath || normalize(filesystem.realpath(path)) === targetReal) return false;
      const stat = filesystem.stat(path);
      if (!known(stat) || (stat.dev === targetStat.dev && stat.ino === targetStat.ino)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

type RetentionVersion = {
  version: number;
  supersededAt?: Date | null;
  retentionGraceUntil?: Date | null;
  preservePermanently?: boolean;
  preserveUntil?: Date | null;
  workflowId?: number | null;
  approvals?: unknown[];
  workflowExecutions?: unknown[];
  workflowTransitions?: unknown[];
};

export const retentionEvidenceInclude = {
  approvals: true,
  workflowExecutions: { select: { id: true } },
  workflowTransitions: { select: { id: true } },
} as const;

export function getVersionRetention(
  version: RetentionVersion,
  document: { currentVersion: number; deletedAt?: Date | null },
  days: number,
  now = new Date(),
) {
  const evidence = [version.approvals, version.workflowExecutions, version.workflowTransitions];
  const evidenceKnown = evidence.every(Array.isArray);
  const isRetentionProtected = version.workflowId != null || evidence.some((refs) => (refs?.length ?? 0) > 0);
  const current = version.version === document.currentVersion;
  const timestamp = version.supersededAt?.getTime();
  let expiresAt: Date | null = null;
  // Ante datos incompletos o inválidos, conservar la versión.
  if (!current && !version.preservePermanently && !isRetentionProtected && evidenceKnown &&
      timestamp != null && Number.isFinite(timestamp) && version.preservePermanently === false) {
    const dates = [timestamp + versionRetentionDays(days) * DAY_MS];
    for (const override of [version.retentionGraceUntil, version.preserveUntil]) {
      if (override != null) dates.push(override.getTime());
    }
    const effective = Math.max(...dates);
    if (Number.isFinite(effective)) expiresAt = new Date(effective);
  }
  return {
    expiresAt,
    isRetentionProtected,
    eligible: !document.deletedAt && expiresAt !== null && expiresAt.getTime() <= now.getTime(),
  };
}

export function retentionOverride(body: { mode: string; preserveUntil?: string }, now = new Date()) {
  const keys = Object.keys(body);
  if (keys.some((key) => !['mode', 'preserveUntil'].includes(key)) ||
      !['normal', 'permanent', 'until'].includes(body.mode)) {
    throw new BadRequestException('La política de conservación no es válida');
  }
  if (body.mode !== 'until') {
    if (Object.prototype.hasOwnProperty.call(body, 'preserveUntil')) {
      throw new BadRequestException('La fecha solo se permite en el modo hasta');
    }
    return { preservePermanently: body.mode === 'permanent', preserveUntil: null };
  }
  const value = body.preserveUntil;
  if (typeof value !== 'string' || !value.includes('T') || !/(Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !isISO8601(value, { strict: true, strictSeparator: true }) ||
      !Number.isFinite(Date.parse(value)) || Date.parse(value) <= now.getTime()) {
    throw new BadRequestException('La fecha de conservación debe ser una fecha ISO válida en el futuro');
  }
  return { preservePermanently: false, preserveUntil: new Date(value) };
}
