import { getVersionRetention, retentionOverride, canUnlinkVersionBlob } from './document-version-retention';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('physical blob identity', () => {
  const identity = (realpath = (path: string) => path) => ({
    realpath: realpath,
    stat: (path: string) => ({ dev: 1, ino: path === '/target' ? 1 : 2, isFile: () => true }),
  });
  it('retains normalized relative/absolute aliases', () => {
    expect(canUnlinkVersionBlob('./uploads/active/file', ['uploads/active/file'], 'linux', identity())).toBe(false);
    expect(canUnlinkVersionBlob('/uploads/active/file', ['/uploads/active/../active/file'], 'linux', identity())).toBe(false);
  });
  it('retains Windows case and separator aliases', () => {
    expect(canUnlinkVersionBlob('C:\\Uploads\\FILE', ['c:/uploads/file'], 'win32', identity())).toBe(false);
  });
  it('retains symlink and hardlink identities', () => {
    expect(canUnlinkVersionBlob('/target', ['/symlink'], 'linux', identity(() => '/target'))).toBe(false);
    expect(canUnlinkVersionBlob('/target', ['/hardlink'], 'linux', { ...identity(), stat: () => ({ dev: 1, ino: 1, isFile: () => true }) })).toBe(false);
  });
  it('allows only known, distinct physical files', () => {
    expect(canUnlinkVersionBlob('/target', ['/other'], 'linux', identity())).toBe(true);
    expect(canUnlinkVersionBlob('/target', [], 'linux', identity())).toBe(true);
  });
  it('retains on an unreadable or unresolved identity', () => {
    expect(canUnlinkVersionBlob('/target', ['/missing'], 'linux', identity(() => { throw new Error('unreadable'); }))).toBe(false);
    expect(canUnlinkVersionBlob('/target', [''], 'linux', identity())).toBe(false);
  });
});

describe('retention schema rollout', () => {
  it('adds metadata and an indexed expiry scan without removing compatibility', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    expect(schema).toMatch(/supersededAt\s+DateTime\?/);
    expect(schema).toMatch(/retentionGraceUntil\s+DateTime\?/);
    expect(schema).toMatch(/preservePermanently\s+Boolean\s+@default\(false\)/);
    expect(schema).toMatch(/preserveUntil\s+DateTime\?/);
    expect(schema).toContain('@@index([supersededAt, id])');
  });
  it('provides rerunnable rollout grace only for obsolete versions and performs no deletion', () => {
    const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261012000000_document_version_retention/migration.sql'), 'utf8');
    expect(sql).toContain('IF NOT EXISTS');
    expect(sql).toContain('INTERVAL \'30 days\'');
    expect(sql).toContain('"currentVersion"');
    expect(sql).toContain('"supersededAt" IS NULL');
    expect(sql).not.toMatch(/DELETE FROM|DROP TABLE/i);
  });
});

describe('version retention policy', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const version = { version: 1, supersededAt: new Date('2026-05-02T00:00:00Z'), retentionGraceUntil: null, preservePermanently: false, preserveUntil: null, workflowId: null, approvals: [], workflowExecutions: [], workflowTransitions: [] };
  const document = { currentVersion: 2, deletedAt: null };
  it('expires exactly at the cutoff and never before', () => {
    expect(getVersionRetention(version, document, 30, now).eligible).toBe(true);
    expect(getVersionRetention(version, document, 30, new Date(now.getTime() - 1)).eligible).toBe(false);
  });
  it.each([
    { version: 2 }, { supersededAt: null }, { supersededAt: new Date(NaN) },
    { preservePermanently: true }, { preserveUntil: new Date('2026-07-01') },
    { retentionGraceUntil: new Date('2026-07-01') }, { workflowId: 5 },
    { approvals: [{ action: null }] }, { workflowExecutions: [{}] }, { workflowTransitions: [{}] },
  ])('protects %j', (patch) => {
    expect(getVersionRetention({ ...version, ...patch }, document, 30, now).eligible).toBe(false);
  });
  it('protects trashed documents', () => {
    expect(getVersionRetention(version, { ...document, deletedAt: now }, 30, now).eligible).toBe(false);
  });
  it('overrides can only extend the automatic deadline', () => {
    expect(getVersionRetention({ ...version, preserveUntil: new Date('2026-05-03') }, document, 30, now).expiresAt).toEqual(now);
    expect(getVersionRetention({ ...version, retentionGraceUntil: new Date('2026-07-01') }, document, 1, now).expiresAt).toEqual(new Date('2026-07-01'));
  });
  it('has no deadline for current, permanent or evidence-linked versions', () => {
    for (const patch of [{ version: 2 }, { preservePermanently: true }, { approvals: [{}] }]) {
      expect(getVersionRetention({ ...version, ...patch }, document, 30, now).expiresAt).toBeNull();
    }
  });
  it('rejects unknown protection evidence rather than aging it', () => {
    expect(getVersionRetention({ ...version, approvals: undefined }, document, 30, now).eligible).toBe(false);
  });
  it('sets and clears preservation without ambiguous payloads', () => {
    expect(retentionOverride({ mode: 'normal' }, now)).toEqual({ preservePermanently: false, preserveUntil: null });
    expect(retentionOverride({ mode: 'permanent' }, now)).toEqual({ preservePermanently: true, preserveUntil: null });
    expect(retentionOverride({ mode: 'until', preserveUntil: '2026-07-01T00:00:00Z' }, now)).toEqual({ preservePermanently: false, preserveUntil: new Date('2026-07-01') });
  });
  it.each([
    { mode: 'other' }, { mode: 'until' }, { mode: 'until', preserveUntil: 'not-a-date' },
    { mode: 'until', preserveUntil: '2026-02-30T00:00:00Z' },
    { mode: 'until', preserveUntil: '2026-06-01T00:00:00Z' },
    { mode: 'normal', preserveUntil: null }, { mode: 'permanent', preserveUntil: '2026-07-01T00:00:00Z' },
    { mode: 'until', preserveUntil: '2026-07-01' }, { mode: 'normal', preservePermanently: true },
  ])('rejects inconsistent or nonfuture payload %j', (body) => {
    expect(() => retentionOverride(body as any, now)).toThrow();
  });
});
