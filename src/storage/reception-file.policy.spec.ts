import { promises as fs, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { ReceptionFilePolicy, candidatePathKeys, normalizeStoredPath } from './reception-file.policy';

describe('reception-file indexed identity policy', () => {
  const root = join(tmpdir(), 'dms-synthetic-policy-root');
  const database = {
    $queryRaw: jest.fn(),
    receptionSubmission: { findFirst: jest.fn() },
    document: { findFirst: jest.fn() },
  };
  let realpath: jest.SpyInstance;
  let stat: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    database.$queryRaw.mockResolvedValue([{ denied: false }]);
    database.receptionSubmission.findFirst.mockResolvedValue(null);
    database.document.findFirst.mockResolvedValue(null);
    stat = jest.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true, isDirectory: () => false } as any);
    realpath = jest.spyOn(fs, 'realpath').mockRejectedValue(Object.assign(new Error('Sintético'), { code: 'ENOENT' }));
  });
  afterEach(() => {
    realpath.mockRestore();
    stat.mockRestore();
  });

  it.each([
    ['uploads\\active\\one.pdf', 'uploads/active/one.pdf'],
    ['./uploads//active/./one.pdf', 'uploads/active/one.pdf'],
    ['././uploads/././one.pdf', 'uploads/one.pdf'],
    ['C:\\other\\uploads\\one.pdf', 'C:/other/uploads/one.pdf'],
    ['/other/uploads/one.pdf', '/other/uploads/one.pdf'],
    ['uploads/active/../one.pdf', 'uploads/one.pdf'],
    ['C:/actual/app/uploads/active/../one.pdf', 'C:/actual/app/uploads/one.pdf'],
    ['../../one.pdf', '../../one.pdf'],
    ['/../../one.pdf', '/one.pdf'],
    ['C:/../../one.pdf', 'C:/one.pdf'],
  ])('normalizes text without stripping a physical root: %s', (raw, expected) => {
    expect(normalizeStoredPath(raw)).toBe(expected);
  });

  it('generates bounded Windows aliases and folds only on Windows', () => {
    expect(candidatePathKeys('C:\\actual\\app\\uploads', 'active/One.pdf', 'win32')).toEqual([
      'active/one.pdf', 'uploads/active/one.pdf', 'c:/actual/app/uploads/active/one.pdf', '/actual/app/uploads/active/one.pdf',
    ]);
    expect(candidatePathKeys('/actual/app/uploads', 'active/One.pdf', 'linux')).toEqual([
      'active/One.pdf', 'uploads/active/One.pdf', '/actual/app/uploads/active/One.pdf',
    ]);
  });

  it('queries indexed hashes with exact keys and all-version reception fallback, never a Document path', async () => {
    const policy = new ReceptionFilePolicy(database, root, 'linux');
    expect(await policy.denies('/active/One.pdf')).toBe(false);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = database.$queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('"ProtectedReceptionFile"');
    expect(sql.sql).toContain('p."normalizedHash" IN');
    expect(sql.sql).toContain('p."normalizedKey" IN');
    expect(sql.sql).toContain('"DocumentVersion"');
    // El modelo real no tiene Document.path: sólo DocumentVersion.path conserva la ruta.
    expect(sql.sql).toContain('v.path');
    expect(sql.sql).not.toContain('d.path');
    expect(sql.sql).not.toContain('"Document" d LEFT JOIN');
    expect(sql.sql).toContain('d."receptionOriginDirectoryId" IS NOT NULL');
    expect(sql.sql).toContain('f."receptionEnabled" = TRUE');
    expect(sql.sql).not.toContain('lower(');
    expect(sql.values).toContain('uploads/active/One.pdf');
    expect(sql.values.filter((value: unknown) => typeof value === 'string' && value.includes('/')).length).toBeLessThanOrEqual(12);
  });

  it('uses the folded indexed keys on Windows, never lowercases Linux requests', async () => {
    await new ReceptionFilePolicy(database, root, 'win32').denies('/One.pdf');
    const sql = database.$queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('p."foldedHash" IN');
    expect(sql.sql).toContain('p."foldedKey" IN');
    expect(sql.values).toContain('uploads/one.pdf');
    expect(sql.values).not.toContain('uploads/One.pdf');
  });

  it.each(['/../one.pdf', '/%2e%2e/one.pdf', '/nested/%2e%2e/one.pdf', '/%00one.pdf', '/%zz', '/nested%5cone.pdf', '//outside/one.pdf'])('rejects invalid raw identity without a database allow fallback: %s', async (value) => {
    expect(await new ReceptionFilePolicy(database, root).denies(value)).toBe(true);
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects alternate data streams and drive aliases on Windows', async () => {
    expect(await new ReceptionFilePolicy(database, root, 'win32').denies('/one.pdf::$DATA')).toBe(true);
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it('decodes once and does not classify a literal encoded filename as the decoded alias', async () => {
    await new ReceptionFilePolicy(database, root).denies('/one%2520file.pdf?download=1');
    const sql = database.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain('uploads/one%20file.pdf');
    expect(sql.values).not.toContain('uploads/one file.pdf');
  });

  it('checks realpath aliases and rejects a changed link target after lookup', async () => {
    realpath.mockResolvedValueOnce(root).mockResolvedValueOnce(resolve(root, 'protected.pdf'))
      .mockResolvedValueOnce(resolve(root, 'changed.pdf'));
    expect(await new ReceptionFilePolicy(database, root).denies('/alias.pdf')).toBe(true);
    expect(database.$queryRaw.mock.calls[0][0].values).toContain('uploads/protected.pdf');
  });

  it('denies a link outside the real upload root before querying the database', async () => {
    realpath.mockResolvedValueOnce(root).mockResolvedValueOnce(resolve(root, '..', 'outside.pdf'));
    expect(await new ReceptionFilePolicy(database, root).denies('/alias.pdf')).toBe(true);
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  it('accepts a stable contained ordinary link after both aliases are checked', async () => {
    realpath.mockResolvedValueOnce(root).mockResolvedValue(resolve(root, 'ordinary.pdf'));
    expect(await new ReceptionFilePolicy(database, root).denies('/alias.pdf')).toBe(false);
    expect(database.$queryRaw.mock.calls[0][0].values).toContain('uploads/alias.pdf');
    expect(database.$queryRaw.mock.calls[0][0].values).toContain('uploads/ordinary.pdf');
  });

  it.each([[], [{}], [{ denied: null }], [{ denied: false }, { denied: false }]].map((result) => ({ result })))('fails closed for an invalid classification result $result', async ({ result }) => {
    database.$queryRaw.mockResolvedValue(result);
    expect(await new ReceptionFilePolicy(database, root).denies('/ordinary.pdf')).toBe(true);
  });

  it('fails closed on database or filesystem errors, without retaining an allow cache', async () => {
    const policy = new ReceptionFilePolicy(database, root);
    expect(await policy.denies('/ordinary.pdf')).toBe(false);
    database.$queryRaw.mockRejectedValue(new Error('BD no disponible'));
    expect(await policy.denies('/ordinary.pdf')).toBe(true);
    realpath.mockRejectedValue(Object.assign(new Error('Sin acceso'), { code: 'EACCES' }));
    expect(await policy.denies('/ordinary.pdf')).toBe(true);
    expect(database.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('denies a known thumbnail from the durable submission identity before consulting a deleted document', async () => {
    database.receptionSubmission.findFirst.mockResolvedValue({ documentId: 42 });
    expect(await new ReceptionFilePolicy(database, root).denies('/thumbnails/thumb_content_v1_42.jpg')).toBe(true);
    expect(database.receptionSubmission.findFirst).toHaveBeenCalledWith({ where: { documentId: 42 }, select: { documentId: true } });
    expect(database.document.findFirst).not.toHaveBeenCalled();
  });

  it('denies a known numeric thumbnail from registry history even without a document or submission row', async () => {
    database.$queryRaw.mockResolvedValueOnce([{ denied: false }]).mockResolvedValueOnce([{ denied: true }]);
    expect(await new ReceptionFilePolicy(database, root).denies('/thumbnails/thumb_content_v4_42.jpg')).toBe(true);
    expect(database.$queryRaw.mock.calls[1][0].sql).toContain('"documentId"');
    expect(database.$queryRaw.mock.calls[1][0].values).toContain(42);
  });

  it('does not invent ownership of an unknown physical thumbnail family', async () => {
    expect(await new ReceptionFilePolicy(database, root).denies('/thumbnails/unknown_42.jpg')).toBe(false);
    expect(database.receptionSubmission.findFirst).not.toHaveBeenCalled();
    expect(database.document.findFirst).not.toHaveBeenCalled();
  });
});

// Verificaciones de fuente: PostgreSQL no se ejecuta aquí; la validación real corresponde a T7.
describe('reception-file migration capture source contract', () => {
  const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261012030000_reception_protected_files/migration.sql'), 'utf8');
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');

  it('keeps document identities without Document/User foreign keys and restricts directory deletion', () => {
    const table = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf('-- Hashes'));
    expect(table).toContain('"documentId" INTEGER NOT NULL');
    expect(table).toContain('REFERENCES "Directory"("id") ON DELETE RESTRICT');
    expect(table).not.toMatch(/REFERENCES "(?:Document|User)"/);
    const model = schema.split('model ProtectedReceptionFile {')[1].split('\n}')[0];
    expect(model).toContain('onDelete: Restrict');
    expect(model).not.toMatch(/\b(?:Document|User)\s+@relation/);
  });

  it('captures all version paths on document writes without assuming a Document path column', () => {
    const body = sql.split('CREATE FUNCTION "capture_reception_document_files"')[1].split('CREATE FUNCTION "capture_reception_version_files"')[0];
    expect(body).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "Document"');
    // "Document" no tiene ruta propia: la captura por documento nunca referencia una columna inexistente.
    expect(body).not.toContain('.path');
    expect(body).toContain('COALESCE(old_origin, new_origin)');
    expect(body).toContain('SELECT path FROM "DocumentVersion" WHERE "documentId" = OLD.id');
    expect(body).toContain('SELECT path FROM "DocumentVersion" WHERE "documentId" = NEW.id');
  });

  it('captures old/new version writes and serializes them against origin admission', () => {
    const body = sql.split('CREATE FUNCTION "capture_reception_version_files"')[1].split('-- Rellena sólo rutas')[0];
    expect(body).toContain('BEFORE INSERT OR UPDATE OR DELETE ON "DocumentVersion"');
    expect(body).toContain('ORDER BY d.id FOR UPDATE');
    expect(body).toContain('OLD.path');
    expect(body).toContain('NEW.path');
    expect(body).toContain('parent_record."receptionOriginDirectoryId"');
  });

  it('backfills currently referenced version paths without inventing old inventory', () => {
    const backfill = sql.split('-- Rellena sólo rutas')[1].split('CREATE FUNCTION "preserve_reception_file_history"')[0];
    expect(backfill).toContain('v.path');
    expect(backfill).not.toContain('d.path');
    expect(backfill).toContain('d."receptionOriginDirectoryId"');
    expect(backfill).toContain('f."receptionEnabled" = TRUE');
    expect(backfill).not.toMatch(/isTrashed|isArchived|pg_ls_dir|COPY|DELETE|UPDATE/);
  });

  it('retains exact raw paths and makes historical records immutable', () => {
    expect(sql).toContain('stored_path, md5(stored_path), normalized');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON "ProtectedReceptionFile"');
    expect(sql).toContain("RAISE EXCEPTION 'El historial de archivos de recepción es inmutable'");
    expect(sql).toContain('AND "rawPath" = stored_path');
    expect(sql).not.toMatch(/dms\.upload_root|process\.cwd|substring|split_part/);
  });

  it('normalizes separators and dot segments lexically without consulting a filesystem root', () => {
    const body = sql.split('CREATE TABLE')[0];
    expect(body).toContain("replace(value, E'\\\\', '/')");
    expect(body).toContain("IF part = '' OR part = '.' THEN CONTINUE");
    expect(body).toContain("IF part = '..' THEN");
    expect(body).toContain('parts := parts[1:count-1]');
    expect(body).toContain('ELSIF NOT absolute THEN parts := array_append(parts, part)');
    expect(body).toContain('IMMUTABLE STRICT PARALLEL SAFE');
  });

  it('provides bounded registry, version and thumbnail identity indexes', () => {
    for (const index of ['ProtectedReceptionFile_normalizedHash_idx', 'ProtectedReceptionFile_foldedHash_idx',
      'DocumentVersion_reception_file_key_idx', 'DocumentVersion_reception_file_folded_idx',
      'ReceptionSubmission_documentId_idx']) expect(sql).toContain(`CREATE INDEX "${index}"`);
  });
});
