import { resolveAccess, assertGrantSubset, loadInheritedAccess, grantResourceAccess, revokeResourceGrant, requireResourceAccess } from './inherited-access.policy';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('inherited ordinary access', () => {
  const read = { canView: true, canEdit: false, canUploadVersion: false, canShare: false };
  it('does not turn public reading into mutation or deletion', () => {
    expect(resolveAccess('owner', 'reader', true, [])).toEqual({ ...read, owner: false });
  });
  it('unions independent live grants without granting ownership', () => {
    expect(resolveAccess('owner', 'reader', false, [read, { ...read, canUploadVersion: true }]))
      .toEqual({ ...read, canUploadVersion: true, owner: false });
  });
  it('gives only the actual owner full authority', () => {
    expect(resolveAccess('owner', 'owner', false, [])).toEqual({ canView: true, canEdit: true, canUploadVersion: true, canShare: true, owner: true });
  });
  it('rejects amplification and resharing without a sharing capability', () => {
    expect(() => assertGrantSubset(read, read)).toThrow();
    expect(() => assertGrantSubset({ ...read, canShare: true }, { ...read, canEdit: true })).toThrow();
    expect(() => assertGrantSubset({ ...read, canShare: true }, read)).not.toThrow();
  });
});

describe('live inherited grant queries and provenance', () => {
  const parent = { id: 10, name: 'Parent', createdById: 'owner', isPublic: false, receptionEnabled: false };
  const document = { id: 50, uploadedById: 'owner', directoryId: 12, isPublic: false };
  const grant = { id: 7, directoryId: 10, documentId: null, userId: 'delegate', grantedById: 'owner',
    canView: true, canEdit: true, canUploadVersion: false, canShare: true, parentGrantId: null };
  function fixture() {
    const db: any = {
      directoryAncestor: { findMany: jest.fn().mockResolvedValue([{ ancestorId: 10, descendantId: 12, depth: 2, ancestor: parent }]) },
      effectiveAccessGrant: { findMany: jest.fn().mockResolvedValue([grant]) },
      user: { findUnique: jest.fn(async ({ where }) => ({ id: where.id })), findMany: jest.fn().mockResolvedValue([{ id: 'owner', name: 'Owner', email: 'owner@example.test' }]) },
      accessGrant: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 8, ...data })),
        findUnique: jest.fn().mockResolvedValue({ ...grant, documentId: 50, directoryId: null }), update: jest.fn() },
    };
    return db;
  }
  it('loads descendant and future document rights in bounded queries, with actual grantor and inherited source', async () => {
    const db = fixture();
    db.directoryAncestor.findMany.mockResolvedValue([
      { ancestorId: 10, descendantId: 12, depth: 2, ancestor: parent },
      { ancestorId: 10, descendantId: 13, depth: 3, ancestor: parent },
    ]);
    const result = await loadInheritedAccess(db, [document, { ...document, id: 51, directoryId: 13 }], 'delegate', 'document');
    for (const id of [50, 51]) {
      expect(result.get(id).capabilities).toEqual({ owner: false, canView: true, canEdit: true, canUploadVersion: false, canShare: true });
      expect(result.get(id).provenance[0]).toMatchObject({ grantId: 7, grantedBy: { id: 'owner' }, sourceDirectory: { id: 10, name: 'Parent' }, inherited: true });
    }
    expect(db.directoryAncestor.findMany).toHaveBeenCalledTimes(1);
    expect(db.effectiveAccessGrant.findMany).toHaveBeenCalledTimes(1);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });
  it('loses rights when the live view revokes a grant or the location no longer has that ancestor', async () => {
    const db = fixture();
    db.effectiveAccessGrant.findMany.mockResolvedValue([]);
    await expect(requireResourceAccess(db, document, 'delegate', 'document', 'canEdit')).rejects.toThrow();
    db.effectiveAccessGrant.findMany.mockResolvedValue([grant]);
    db.directoryAncestor.findMany.mockResolvedValue([]);
    await expect(requireResourceAccess(db, { ...document, directoryId: 20 }, 'delegate', 'document', 'canView')).rejects.toThrow();
  });
  it('distinguishes the actual delegate grantor from its inherited root authority source', async () => {
    const db = fixture();
    db.effectiveAccessGrant.findMany.mockResolvedValue([{ ...grant, id: 11, directoryId: null, documentId: 50,
      grantedById: 'actual-delegate', parentGrantId: 9, sourceGrantId: 7, sourceDirectoryId: 10 }]);
    const result = (await loadInheritedAccess(db, [document], 'delegate', 'document')).get(50);
    expect(result.provenance[0]).toMatchObject({ grantedBy: { id: 'actual-delegate' }, inherited: false,
      sourceDirectory: null, parentGrantId: 9, authoritySource: { grantId: 7, directory: { id: 10, name: 'Parent' } } });
  });
  it('ties delegated grants to their actual source and cannot amplify version rights', async () => {
    const db = fixture();
    const created = await grantResourceAccess(db, document, 'delegate', 'document', { userId: 'recipient', canEdit: true });
    expect(created).toMatchObject({ grantedById: 'delegate', parentGrantId: 7, canEdit: true, canUploadVersion: false });
    await expect(grantResourceAccess(db, document, 'delegate', 'document', { userId: 'recipient', canUploadVersion: true })).rejects.toThrow();
    expect(db.accessGrant.create).toHaveBeenCalledTimes(1);
  });
  it('updates the selected delegate grant as owner without rewriting its authority source', async () => {
    const db = fixture();
    db.effectiveAccessGrant.findMany.mockResolvedValue([{ ...grant, id: 42 }]);
    db.accessGrant.findUnique.mockResolvedValue({ id: 42, documentId: 50, userId: 'recipient', grantedById: 'delegate', parentGrantId: 7 });
    await grantResourceAccess(db, document, 'owner', 'document', { userId: 'recipient', canEdit: true }, 42);
    expect(db.accessGrant.update).toHaveBeenCalledWith({ where: { id: 42 }, data: {
      canView: true, canEdit: true, canUploadVersion: false, canShare: false, expiresAt: null,
    } });
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
  it.each(['expired', 'dependency-invalid'])('rejects a targeted %s grant without reactivating it', async reason => {
    const db = fixture();
    db.accessGrant.findUnique.mockResolvedValue({ id: 42, documentId: 50, userId: 'recipient',
      grantedById: 'delegate', revokedAt: null, expiresAt: reason === 'expired' ? new Date('2000-01-01') : null });
    db.effectiveAccessGrant.findMany.mockResolvedValue([]);
    await expect(grantResourceAccess(db, document, 'owner', 'document', { userId: 'recipient' }, 42))
      .rejects.toThrow('vigente');
    expect(db.accessGrant.update).not.toHaveBeenCalled();
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
  it('preserves a targeted live grant expiry when the request omits it', async () => {
    const db = fixture();
    const expiresAt = new Date('2099-01-01');
    db.accessGrant.findUnique.mockResolvedValue({ id: 42, documentId: 50, userId: 'recipient', grantedById: 'delegate', expiresAt });
    db.effectiveAccessGrant.findMany.mockResolvedValue([{ ...grant, id: 42 }]);
    await grantResourceAccess(db, document, 'owner', 'document', { userId: 'recipient' }, 42);
    expect(db.accessGrant.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expiresAt }) }));
  });
  it.each([
    { documentId: 51, userId: 'recipient' },
    { documentId: null, directoryId: 50, userId: 'recipient' },
    { documentId: 50, userId: 'different' },
    { documentId: 50, userId: 'recipient', revokedAt: new Date() },
  ])('rejects a concrete grant outside the requested live document and recipient: %j', async target => {
    const db = fixture();
    db.accessGrant.findUnique.mockResolvedValue({ id: 42, grantedById: 'delegate', ...target });
    await expect(grantResourceAccess(db, document, 'owner', 'document', { userId: 'recipient' }, 42)).rejects.toThrow('Concesión no encontrada');
    expect(db.accessGrant.update).not.toHaveBeenCalled();
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
  it('denies another delegate but allows the original grantor to update its concrete grant', async () => {
    const db = fixture();
    db.accessGrant.findUnique.mockResolvedValue({ id: 42, documentId: 50, userId: 'recipient', grantedById: 'other' });
    await expect(grantResourceAccess(db, document, 'delegate', 'document', { userId: 'recipient' }, 42)).rejects.toThrow('otros usuarios');
    expect(db.accessGrant.update).not.toHaveBeenCalled();
    db.accessGrant.findUnique.mockResolvedValue({ id: 42, documentId: 50, userId: 'recipient', grantedById: 'delegate' });
    db.effectiveAccessGrant.findMany.mockResolvedValue([grant, { ...grant, id: 42 }]);
    await grantResourceAccess(db, document, 'delegate', 'document', { userId: 'recipient' }, 42);
    expect(db.accessGrant.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
  });
  it('cannot combine two narrower sources into one amplified delegable grant', async () => {
    const db = fixture();
    db.effectiveAccessGrant.findMany.mockResolvedValue([
      grant, { ...grant, id: 9, canEdit: false, canUploadVersion: true },
    ]);
    await expect(grantResourceAccess(db, document, 'delegate', 'document', {
      userId: 'recipient', canEdit: true, canUploadVersion: true,
    })).rejects.toThrow('una sola fuente');
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });
  it('allows revocation only by the resource owner or actual grantor, not administrators or other delegates', async () => {
    const db = fixture();
    await expect(revokeResourceGrant(db, document, 'admin', 'document', 7)).rejects.toThrow('otros usuarios');
    await expect(revokeResourceGrant(db, document, 'delegate', 'document', 7)).rejects.toThrow('otros usuarios');
    await expect(revokeResourceGrant(db, document, 'owner', 'document', 7)).resolves.toMatchObject({ revoked: true });
    expect(db.accessGrant.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { revokedAt: expect.any(Date) } });
  });
  it('never applies ordinary inherited or public rights to reception content', async () => {
    const db = fixture();
    for (const protection of [{ receptionOriginDirectoryId: 10 }, { directory: { receptionEnabled: true } }]) {
      const access = (await loadInheritedAccess(db, [{ ...document, isPublic: true, ...protection }], 'delegate', 'document')).get(50);
      expect(access.capabilities).toMatchObject({ canView: false, canEdit: false, canUploadVersion: false, canShare: false });
      expect(access.provenance).toEqual([]);
    }
  });
  it('does not treat public discoverability as destination upload authority', async () => {
    const db = fixture();
    db.effectiveAccessGrant.findMany.mockResolvedValue([]);
    db.directoryAncestor.findMany.mockResolvedValue([{ ancestorId: 10, descendantId: 10, depth: 0, ancestor: { ...parent, isPublic: true } }]);
    const folder = { ...parent, isPublic: true };
    await expect(requireResourceAccess(db, folder, 'reader', 'directory', 'canView')).resolves.toBeDefined();
    await expect(requireResourceAccess(db, folder, 'reader', 'directory', 'canUploadVersion')).rejects.toThrow();
  });
  it('migration defines live chained authorization and structural ancestry refresh without executing SQL', () => {
    const sql = readFileSync(join(__dirname, '../..', 'prisma/migrations/20261014010000_directory_inherited_access/migration.sql'), 'utf8');
    expect(sql).toContain('CREATE VIEW "EffectiveAccessGrant"');
    expect(sql).toContain('c."parentGrantId"');
    expect(sql).toContain('p."userId" = c."grantedById" AND p."canShare"');
    expect(sql).toContain('"revokedAt" IS NULL');
    expect(sql).toContain('g."expiresAt" >= statement_timestamp()');
    expect(sql).toContain('c.location');
    expect(sql).toContain('FOR EACH STATEMENT EXECUTE FUNCTION refresh_directory_ancestry()');
  });
  it('bounds and atomically guards the stable hierarchy before any schema change or backfill', () => {
    const sql = readFileSync(join(__dirname, '../..', 'prisma/migrations/20261014010000_directory_inherited_access/migration.sql'), 'utf8');
    const executable = sql.replace(/--[^\n]*/g, '').trim();
    expect(executable).toMatch(/^BEGIN;/);
    expect(executable).toMatch(/COMMIT;$/);
    expect(executable.match(/^COMMIT;/gm)).toHaveLength(1);
    expect(sql).toContain("SET LOCAL lock_timeout = '10s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '120s';");
    const guard = sql.slice(0, sql.indexOf('ALTER TABLE'));
    expect(guard).toContain('LOCK TABLE "Directory" IN SHARE ROW EXCLUSIVE MODE;');
    expect(guard).toContain('WITH RECURSIVE parents AS');
    expect(guard).toContain('d.id = ANY(p.visited)');
    expect(guard).toContain('WHERE NOT p.cycle');
    expect(guard).toContain("USING ERRCODE = '23514'");
    expect(executable).not.toMatch(/\b(?:DROP|TRUNCATE)\b/i);
    expect(executable).not.toMatch(/ALTER TABLE[^;]+\b(?:DROP|RENAME|ALTER COLUMN)\b/i);
    expect(executable.match(/DELETE FROM[^;]+;/g)).toEqual(['DELETE FROM "DirectoryAncestor";']);
    expect(executable).not.toMatch(/^UPDATE\s|^INSERT INTO "(?:Directory|Document|DocumentPermission|AccessGrant)"/gm);
  });
});
describe('batched outgoing sharing summaries', () => {
  const document = { id: 50, uploadedById: 'owner', directoryId: null, isPublic: false };
  const none = { shared: false, direct: false, inherited: false, public: false };
  function fixture(direct: any[] = []) {
    const db: any = {
      directoryAncestor: { findMany: jest.fn().mockResolvedValue([]) },
      effectiveAccessGrant: { findMany: jest.fn(async ({ where }) => typeof where.userId === 'string' ? [] : direct) },
      documentPermission: { findMany: jest.fn().mockResolvedValue([]) },
      documentShare: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return db;
  }
  it('shows owner outgoing sharing even when incoming provenance is empty, without exposing recipients', async () => {
    const db = fixture([{ documentId: 50, directoryId: null, userId: 'private-recipient', email: 'private@example.test' }]);
    const access = (await loadInheritedAccess(db, [document], 'owner', 'document', true)).get(50);
    expect(access.sharingSummary).toEqual({ ...none, shared: true, direct: true });
    expect(access.provenance).toEqual([]);
    expect(JSON.stringify(access)).not.toContain('private-recipient');
    expect(JSON.stringify(access)).not.toContain('private@example.test');
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it('adds only bounded summary queries for a page, with no recipient identities in their selection', async () => {
    const db = fixture([{ documentId: 50 }, { documentId: 51 }]);
    const access = await loadInheritedAccess(db, [document, { ...document, id: 51 }], 'reader', 'document', true);
    expect(access.get(50).sharingSummary.direct).toBe(true);
    expect(access.get(51).sharingSummary.direct).toBe(true);
    const summaryQuery = db.effectiveAccessGrant.findMany.mock.calls.find(([query]) => !query.where.userId)[0];
    expect(summaryQuery.select).toEqual({ documentId: true, directoryId: true });
    expect(summaryQuery.where.OR).toEqual(expect.arrayContaining([
      { documentId: 50, userId: { not: 'owner' } }, { documentId: 51, userId: { not: 'owner' } },
    ]));
    expect(db.effectiveAccessGrant.findMany).toHaveBeenCalledTimes(2);
    expect(db.documentPermission.findMany).toHaveBeenCalledTimes(2);
    expect(db.documentShare.findMany).toHaveBeenCalledTimes(2);
    expect(access.get(50).capabilities).toEqual({ owner: false, canView: false, canEdit: false, canUploadVersion: false, canShare: false });
  });
  it('uses live grants rather than raw revoked, expired or dependency-invalid grants', async () => {
    const db = fixture();
    db.accessGrant = { findMany: jest.fn().mockResolvedValue([{ documentId: 50, revokedAt: new Date() }]) };
    const access = (await loadInheritedAccess(db, [document], 'owner', 'document', true)).get(50);
    expect(access.sharingSummary).toEqual(none);
    expect(db.accessGrant.findMany).not.toHaveBeenCalled();
  });
  it('counts legacy named read grants using active expiry and revocation filters', async () => {
    const db = fixture();
    db.documentPermission.findMany.mockImplementation(async ({ where }) => typeof where.userId === 'string' ? [] : [{ documentId: 50 }]);
    const access = (await loadInheritedAccess(db, [document], 'owner', 'document', true)).get(50);
    expect(access.sharingSummary).toEqual({ ...none, shared: true, direct: true });
    const legacyQuery = db.documentPermission.findMany.mock.calls.find(([query]) => typeof query.where.userId !== 'string')[0];
    expect(legacyQuery.select).toEqual({ documentId: true });
    expect(legacyQuery.where).toMatchObject({ canView: true, userId: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }] });
    const shareQuery = db.documentShare.findMany.mock.calls.find(([query]) => typeof query.where.userId !== 'string')[0];
    expect(shareQuery.where.revokedAt).toBeNull();
  });
  it('distinguishes local directory grants from strict ancestor grants and effective public access', async () => {
    const folder = { id: 12, createdById: 'owner', isPublic: false, receptionEnabled: false, name: 'Child' };
    const parent = { id: 10, createdById: 'parent-owner', isPublic: true, receptionEnabled: false, name: 'Parent' };
    const db = fixture([{ directoryId: 12 }, { directoryId: 10 }]);
    db.directoryAncestor.findMany.mockResolvedValue([
      { ancestorId: 12, descendantId: 12, depth: 0, ancestor: folder },
      { ancestorId: 10, descendantId: 12, depth: 1, ancestor: parent },
    ]);
    const access = (await loadInheritedAccess(db, [folder], 'reader', 'directory', true)).get(12);
    expect(access.sharingSummary).toEqual({ shared: true, direct: true, inherited: true, public: true });
    expect(access.capabilities).toEqual({ owner: false, canView: true, canEdit: false, canUploadVersion: false, canShare: false });
  });
  it('includes the containing folder as inherited sharing for documents but not as an unrelated direct grant', async () => {
    const db = fixture([{ directoryId: 12 }]);
    db.directoryAncestor.findMany.mockResolvedValue([{ ancestorId: 12, descendantId: 12, depth: 0,
      ancestor: { id: 12, createdById: 'folder-owner', receptionEnabled: false, isPublic: false } }]);
    const access = (await loadInheritedAccess(db, [{ ...document, directoryId: 12 }], 'owner', 'document', true)).get(50);
    expect(access.sharingSummary).toEqual({ ...none, shared: true, inherited: true });
  });
  it('marks local public content without implying a named direct grant', async () => {
    const db = fixture();
    const access = (await loadInheritedAccess(db, [{ ...document, isPublic: true }], 'reader', 'document', true)).get(50);
    expect(access.sharingSummary).toEqual({ ...none, shared: true, public: true });
    expect(access.capabilities).toEqual({ owner: false, canView: true, canEdit: false, canUploadVersion: false, canShare: false });
  });
  it('does not attach ordinary summaries to protected reception content', async () => {
    const db = fixture([{ documentId: 50 }]);
    const access = (await loadInheritedAccess(db, [{ ...document, isPublic: true, receptionOriginDirectoryId: 12 }], 'owner', 'document', true)).get(50);
    expect(access.sharingSummary).toEqual(none);
    expect(access.provenance).toEqual([]);
  });
  it('preserves incoming actual grantor names and keeps other recipients out of provenance', async () => {
    const db = fixture();
    const incoming = { id: 7, documentId: 50, directoryId: null, userId: 'reader', grantedById: 'grantor',
      canView: true, canEdit: false, canUploadVersion: false, canShare: false };
    db.effectiveAccessGrant.findMany.mockImplementation(async ({ where }) => typeof where.userId === 'string' ? [incoming]
      : [{ documentId: 50, directoryId: null, userId: 'other-private-recipient' }]);
    db.user.findMany.mockResolvedValue([{ id: 'grantor', name: 'Actual grantor', email: 'grantor@example.test' }]);
    const access = (await loadInheritedAccess(db, [document], 'reader', 'document', true)).get(50);
    expect(access.provenance).toHaveLength(1);
    expect(access.provenance[0].grantedBy).toEqual({ id: 'grantor', name: 'Actual grantor', email: 'grantor@example.test' });
    expect(access.sharingSummary).toEqual({ ...none, shared: true, direct: true });
    expect(JSON.stringify(access)).not.toContain('other-private-recipient');
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });
});
