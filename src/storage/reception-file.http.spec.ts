import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Module({})
class SyntheticFileModule {}
import { ServeStaticModule } from '@nestjs/serve-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import request = require('supertest');
import { ReceptionFilePolicy, normalizeStoredPath } from './reception-file.policy';
import { installReceptionFileProtection } from './reception-file.middleware';

// Sólo datos sintéticos; no se inicia AppModule ni se conecta a PostgreSQL.
describe('reception-file actual HTTP static boundary', () => {
  let app: INestApplication;
  let root: string;
  let outsideRoot: string;
  // Sólo se registran las raíces mkdtemp creadas por esta ejecución; nunca rutas históricas o ajenas.
  const ownedRoots: string[] = [];
  let unavailable = false;
  const protectedPaths = new Set<string>();
  const key = (value: string) => process.platform === 'win32'
    ? normalizeStoredPath(value).toLowerCase() : normalizeStoredPath(value);
  const registryIds = new Set<number>();
  // "Document" no tiene ruta propia: el estado de recepción vive en el documento y las rutas en sus versiones.
  const currentDocuments: Array<{ id: number; origin: number | null; receptionEnabled: boolean }> = [];
  const currentVersions: Array<{ documentId: number; path: string }> = [];
  const ledger = new Set<number>();
  const liveThumbnails = new Set<number>();
  const database = {
    $queryRaw: jest.fn(async (sql: any) => {
      if (unavailable) throw new Error('BD no disponible');
      if (sql.values.some((value: unknown) => typeof value === 'number')) {
        return [{ denied: sql.values.some((value: number) => registryIds.has(value)) }];
      }
      const keys = sql.values.filter((value: unknown) => typeof value === 'string');
      const protectedDocument = (document: typeof currentDocuments[number]) => document.origin !== null || document.receptionEnabled;
      return [{ denied: keys.some((candidate: string) => protectedPaths.has(candidate)) ||
        currentVersions.some((version) => keys.includes(key(version.path)) && currentDocuments.some((document) =>
          document.id === version.documentId && protectedDocument(document))) }];
    }),
    receptionSubmission: { findFirst: jest.fn(async ({ where }: any) =>
      ledger.has(where.documentId) ? { documentId: where.documentId } : null) },
    document: { findFirst: jest.fn(async ({ where }: any) =>
      liveThumbnails.has(where.id) ? { id: where.id } : null) },
  };

  beforeAll(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'dms-reception-http-'));
    ownedRoots.push(root);
    await fs.writeFile(join(root, 'index.html'), 'synthetic-root-index');
    await fs.writeFile(join(root, '.ignored.txt'), 'synthetic-dotfile');
    await fs.mkdir(join(root, 'indexed'));
    await fs.writeFile(join(root, 'indexed', 'index.html'), 'synthetic-directory-index');
    await fs.mkdir(join(root, 'thumbnails'));
    await fs.mkdir(join(root, 'secure'));
    await fs.writeFile(join(root, 'secure', 'protected-child.txt'), 'synthetic-protected-child');
    await fs.writeFile(join(root, 'secure', 'ordinary-child.txt'), 'synthetic-ordinary-child');
    outsideRoot = await fs.mkdtemp(join(tmpdir(), 'dms-reception-http-outside-'));
    ownedRoots.push(outsideRoot);
    await fs.writeFile(join(outsideRoot, 'escaped.txt'), 'synthetic-outside-root');
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await fs.symlink(join(root, 'secure'), join(root, 'alias'), linkType);
    await fs.symlink(outsideRoot, join(root, 'escape'), linkType);
    for (const name of ['ordinary.txt', 'current.txt', 'old-version.txt', 'residual.txt', 'moved.txt', 'Case.txt', 'case.txt', 'once%20.txt']) {
      await fs.writeFile(join(root, name), `synthetic:${name}`);
    }
    for (const id of [7, 8, 9]) {
      await fs.writeFile(join(root, 'thumbnails', `thumb_${id}.jpg`), 'synthetic-legacy-thumbnail');
      for (const version of [1, 3, 4]) {
        await fs.writeFile(join(root, 'thumbnails', `thumb_content_v${version}_${id}.jpg`), 'synthetic-thumbnail');
      }
    }
    app = await NestFactory.create({ module: SyntheticFileModule, imports: [
      ServeStaticModule.forRoot({ rootPath: root, serveRoot: '/files' }),
    ] }, { logger: false });
    app.setGlobalPrefix('api');
    installReceptionFileProtection(app, new ReceptionFilePolicy(database, root));
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      // Sólo se eliminan las raíces mkdtemp creadas por esta ejecución; una ruta ajena jamás se borra.
      for (const ownedRoot of ownedRoots.splice(0)) {
        if (dirname(ownedRoot) !== resolve(tmpdir()) || !basename(ownedRoot).startsWith('dms-reception-http-')) continue;
        try {
          await fs.rm(ownedRoot, { recursive: true, force: true });
        } catch {
          // Best-effort: un bloqueo transitorio de Windows no debe enmascarar el resultado de los tests.
        }
      }
    }
  });

  beforeEach(() => {
    unavailable = false;
    protectedPaths.clear();
    registryIds.clear();
    currentDocuments.length = 0;
    currentVersions.length = 0;
    ledger.clear();
    liveThumbnails.clear();
    for (const name of ['current.txt', 'old-version.txt', 'residual.txt', 'moved.txt', 'Case.txt']) {
      protectedPaths.add(key(`uploads/${name}`));
    }
    protectedPaths.add(key('uploads/secure/protected-child.txt'));
    ledger.add(7);
    liveThumbnails.add(8);
    jest.clearAllMocks();
  });

  it('keeps ordinary raw assets public at /files, not /api/files', async () => {
    const response = await request(app.getHttpServer()).get('/files/ordinary.txt').expect(200);
    expect(response.text).toBe('synthetic:ordinary.txt');
    await request(app.getHttpServer()).get('/api/files/ordinary.txt').expect(404);
  });

  it.each(['current.txt', 'old-version.txt', 'residual.txt', 'moved.txt'])('denies protected %s despite a bearer token', async (name) => {
    await request(app.getHttpServer()).get(`/files/${name}`).set('Authorization', 'Bearer synthetic').expect(404);
  });

  it('covers moved origins and old versions before registry capture, then durable residuals after rows disappear', async () => {
    protectedPaths.clear();
    currentDocuments.push({ id: 42, origin: 3, receptionEnabled: false });
    currentVersions.push({ documentId: 42, path: 'uploads/moved.txt' });
    currentVersions.push({ documentId: 42, path: 'uploads/old-version.txt' });
    await request(app.getHttpServer()).get('/files/moved.txt').expect(404);
    await request(app.getHttpServer()).get('/files/old-version.txt').expect(404);
    protectedPaths.add(key('uploads/moved.txt'));
    protectedPaths.add(key('uploads/old-version.txt'));
    currentDocuments.length = 0;
    currentVersions.length = 0;
    await request(app.getHttpServer()).get('/files/moved.txt').expect(404);
    await request(app.getHttpServer()).get('/files/old-version.txt').expect(404);
  });

  it('covers current reception fallback without origin and denies shared paths with any protected owner', async () => {
    protectedPaths.clear();
    currentDocuments.push({ id: 1, origin: null, receptionEnabled: false });
    currentVersions.push({ documentId: 1, path: 'uploads/current.txt' });
    await request(app.getHttpServer()).get('/files/current.txt').expect(200);
    currentDocuments.push({ id: 2, origin: null, receptionEnabled: true });
    currentVersions.push({ documentId: 2, path: 'uploads/current.txt' });
    await request(app.getHttpServer()).get('/files/current.txt').expect(404);
  });

  it('denies HEAD, range and conditional requests before static publication', async () => {
    await request(app.getHttpServer()).head('/files/current.txt').expect(404);
    await request(app.getHttpServer()).get('/files/current.txt').set('Range', 'bytes=0-3').expect(404);
    await request(app.getHttpServer()).get('/files/current.txt').set('If-None-Match', '*').expect(404);
  });

  it('retains ordinary HEAD and range semantics', async () => {
    await request(app.getHttpServer()).head('/files/ordinary.txt').expect(200);
    const response = await request(app.getHttpServer()).get('/files/ordinary.txt').set('Range', 'bytes=0-3').expect(206);
    expect(response.text).toBe('synt');
  });

  it('denies the legacy thumb_ID alias evidenced by thumbnail history tests', async () => {
    await request(app.getHttpServer()).get('/files/thumbnails/thumb_7.jpg').expect(404);
  });

  it.each([1, 3, 4])('denies known thumbnail v%s aliases after document deletion', async (version) => {
    await request(app.getHttpServer()).get(`/files/thumbnails/thumb_content_v${version}_7.jpg`).expect(404);
  });

  it('denies known thumbnail aliases from path registry document identity without surviving document rows', async () => {
    registryIds.add(9);
    await request(app.getHttpServer()).get('/files/thumbnails/thumb_content_v4_9.jpg').expect(404);
  });

  it('denies current reception thumbnails before a ledger exists, leaves ordinary thumbnails alone', async () => {
    await request(app.getHttpServer()).get('/files/thumbnails/thumb_content_v4_8.jpg').expect(404);
    await request(app.getHttpServer()).get('/files/thumbnails/thumb_content_v4_9.jpg').expect(200);
  });

  it('matches exact native absolute stored paths without arbitrary uploads suffix inference', async () => {
    protectedPaths.clear();
    protectedPaths.add(key(join(root, 'current.txt')));
    await request(app.getHttpServer()).get('/files/current.txt').expect(404);
    protectedPaths.clear();
    protectedPaths.add('/unrelated/uploads/current.txt');
    await request(app.getHttpServer()).get('/files/current.txt').expect(200);
  });

  it('decodes once, blocks separators and encoded traversal, and cannot bypass via api', async () => {
    await request(app.getHttpServer()).get('/files/%63urrent.txt').expect(404);
    await request(app.getHttpServer()).get('/files/%2e%2e%2fcurrent.txt').expect(404);
    await request(app.getHttpServer()).get('/files/thumbnails%5cthumb_content_v4_7.jpg').expect(404);
    await request(app.getHttpServer()).get('/files/%00current.txt').expect(404);
    await request(app.getHttpServer()).get('/api/files/current.txt').expect(404);
    await request(app.getHttpServer()).get('/files/once%2520.txt').expect(200);
  });

  it('classifies contained realpath aliases and rejects a link escaping the upload root', async () => {
    await request(app.getHttpServer()).get('/files/alias/protected-child.txt').expect(404);
    await request(app.getHttpServer()).get('/files/alias/ordinary-child.txt').expect(200);
    await request(app.getHttpServer()).get('/files/escape/escaped.txt').expect(404);
  });

  it('protects actual directory index bytes and ServeStatic render fallback bytes', async () => {
    protectedPaths.add(key('uploads/indexed/index.html'));
    await request(app.getHttpServer()).get('/files/indexed/').expect(404);
    protectedPaths.delete(key('uploads/indexed/index.html'));
    await request(app.getHttpServer()).get('/files/indexed/').expect(200);
    await request(app.getHttpServer()).get('/files/').expect(200);
    protectedPaths.add(key('uploads/index.html'));
    await request(app.getHttpServer()).get('/files/').expect(404);
    await request(app.getHttpServer()).get('/files/nonexistent.txt').expect(404);
    await request(app.getHttpServer()).get('/files/.ignored.txt').expect(404);
    await request(app.getHttpServer()).get('/files/ordinary.txt').expect(200);
  });

  it('respects case on the target platform', async () => {
    await request(app.getHttpServer()).get('/files/Case.txt').expect(404);
    await request(app.getHttpServer()).get('/files/case.txt').expect(process.platform === 'win32' ? 404 : 200);
  });

  it('fails closed even for ordinary bytes when database lookup fails', async () => {
    unavailable = true;
    await request(app.getHttpServer()).get('/files/ordinary.txt').expect(404);
  });
});
