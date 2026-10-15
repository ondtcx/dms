import * as fs from 'fs';
import { BadRequestException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { OnlyofficeService } from './onlyoffice.service';
import { CreateBlankDocumentDto } from './dto/create-blank-document.dto';

const extractionMock = () => ({ extractFromFile: jest.fn().mockResolvedValue(null) });
const directoryMock = () => ({ assertDocumentMutation: jest.fn().mockResolvedValue(true) });
const pdfOcrMock = () => ({ enqueue: jest.fn().mockReturnValue('accepted') });

jest.mock('fs');
jest.mock('jsonwebtoken', () => {
  const actual = jest.requireActual('jsonwebtoken');
  return { ...actual, verify: jest.fn(actual.verify) };
});

describe('OnlyofficeService.checkHealth', () => {
  let service: OnlyofficeService;
  let config: { get: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = {
      get: jest.fn(),
    };
    service = new OnlyofficeService(
      config as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      extractionMock() as never,
      directoryMock() as never,
      pdfOcrMock() as never,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns unavailable when ONLYOFFICE_URL is not configured', async () => {
    config.get.mockReturnValue(undefined);

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns unavailable when ONLYOFFICE_URL is malformed', async () => {
    config.get.mockReturnValue('not-a-url');

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns available when the healthcheck responds with 200', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await expect(service.checkHealth()).resolves.toEqual({ available: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://onlyoffice.test/healthcheck',
      {
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('returns unavailable for other 2xx statuses (201/204)', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
  });

  it('returns unavailable when the healthcheck responds with a non-200 status', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
  });

  it('returns unavailable when the healthcheck times out after 3000ms', async () => {
    jest.useFakeTimers();
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new Error('upstream timeout')),
          );
        }),
    );

    const healthcheck = service.checkHealth();
    await jest.advanceTimersByTimeAsync(3000);

    await expect(healthcheck).resolves.toEqual({ available: false });
  });

  it('does not expose upstream errors in the response', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockRejectedValue(new Error('database credentials leaked'));

    const result = await service.checkHealth();

    expect(result).toEqual({ available: false });
    expect(result).not.toHaveProperty('error');
  });
});

describe('OnlyofficeService authentication regressions', () => {
  const secret = ' onlyoffice-secret ';
  const claims = { status: 1, key: 'doc_42_save_1' };

  const createService = (...args: [unknown?]) => {
    const configuredSecret = args.length ? args[0] : secret;
    jest.clearAllMocks();
    const config = { get: jest.fn().mockReturnValue(configuredSecret) };
    const tx = {
      onlyofficeCallbackReceipt: { create: jest.fn() },
      $queryRawUnsafe: jest.fn(),
      document: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      documentVersion: { create: jest.fn() },
      documentAccess: { create: jest.fn() },
    };
    const prisma = {
      document: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const storage = {
      getPaths: jest.fn(),
      generateStructuredPath: jest.fn(),
      moveFile: jest.fn(),
      deleteFile: jest.fn(),
      calculateFileHash: jest.fn(),
    };
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const directoryService = directoryMock();
    return {
      service: new OnlyofficeService(
        config as unknown as ConfigService,
        storage as never,
        prisma as never,
        {} as never,
        extractionMock() as never,
        directoryService as never,
        pdfOcrMock() as never,
      ),
      config,
      prisma,
      storage,
      tx,
      fetchMock,
      directoryService,
    };
  };

  const expectNoDownstreamWork = ({ prisma, storage, fetchMock, tx }: any) => {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(prisma.document.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    Object.values(storage).forEach((mock: any) =>
      expect(mock).not.toHaveBeenCalled(),
    );
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
    Object.values(tx)
      .filter((value: any) => typeof value === 'object')
      .flatMap((value: any) => Object.values(value))
      .forEach((mock: any) => expect(mock).not.toHaveBeenCalled());
  };

  it.each([
    ['header', { authorization: `Bearer ${jwt.sign(claims, secret.trim())}` }],
    ['body', { body: { token: jwt.sign(claims, secret.trim()) } }],
  ])('accepts %s token transport', async (_name, input) => {
    const { service } = createService();
    const token = jwt.sign(claims, secret.trim());
    const result = await service.handleCallback(
      42,
      (input as any).body || { token },
      (input as any).authorization,
    );
    expect(result).toEqual({ error: 0 });
  });

  it.each([' Bearer token', 'Bearer token ', 'Basic token', 'Bearer a b'])(
    'rejects malformed authorization transport: %s',
    async (authorization) => {
      const context = createService();
      await expect(
        context.service.handleCallback(
          42,
          { token: 'body-token' },
          authorization,
        ),
      ).resolves.toEqual({ error: 1 });
      expectNoDownstreamWork(context);
    },
  );

  it('rejects missing secrets and never verifies', async () => {
    const context = createService('   ');
    await expect(
      context.service.handleCallback(42, { token: 'token' }),
    ).resolves.toEqual({ error: 1 });
    expect(jwt.verify).not.toHaveBeenCalled();
    expectNoDownstreamWork(context);
  });

  it('fails closed when secret lookup throws', () => {
    const context = createService();
    context.config.get.mockImplementation(() => {
      throw new Error('secret lookup failed');
    });

    expect(context.service.verifyFileToken('token', 42)).toBeNull();
    expectNoDownstreamWork(context);
  });

  it('fails closed when secret lookup returns null', () => {
    const context = createService(null);
    expect(context.service.verifyFileToken('token', 42)).toBeNull();
    expectNoDownstreamWork(context);
  });

  it('uses the explicit HS256 verifier options and binds file tokens', () => {
    const { service } = createService();
    const token = jwt.sign({ documentId: 42 }, secret.trim(), {
      algorithm: 'HS256',
    });
    expect(service.verifyFileToken(token, 42)).toEqual({ documentId: 42 });
    expect(service.verifyFileToken(token, 7)).toBeNull();
  });

  it.each([
    ['malformed', 'not.a.jwt', secret],
    [
      'expired',
      jwt.sign({ documentId: 42 }, secret.trim(), { expiresIn: -1 }),
      secret,
    ],
    ['unsigned', 'eyJhbGciOiJub25lIn0.eyJkb2N1bWVudElkIjo0Mn0.', secret],
    [
      'wrong algorithm',
      jwt.sign({ documentId: 42 }, secret.trim(), { algorithm: 'HS384' }),
      secret,
    ],
    ['wrong route', jwt.sign({ documentId: 7 }, secret.trim()), secret],
    ['missing secret', 'not.a.jwt', undefined],
    ['empty secret', 'not.a.jwt', ''],
    ['blank secret', 'not.a.jwt', '   '],
  ] as const)(
    'rejects invalid file token %s before Prisma',
    (_name, token, configuredSecret) => {
      jest.clearAllMocks();
      const context = createService(configuredSecret);
      expect(context.service.verifyFileToken(token, 42)).toBeNull();
      expectNoDownstreamWork(context);
      if (!configuredSecret) expect(jwt.verify).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '   '] as const)(
    'rejects file-token generation with secret %p',
    (configuredSecret) => {
      const { service } = createService();
      expect(() =>
        service.generateFileToken(42, configuredSecret as unknown as string),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    ['matching dual', claims, true],
    ['mismatched dual', claims, false],
    ['empty body', { ...claims, token: '' }, false],
    ['padded body', { ...claims, token: ' token ' }, false],
    ['non-string body', { ...claims, token: 42 }, false],
  ] as const)('handles %s token transport', async (_name, body, accepted) => {
    const context = createService();
    const { service } = context;
    const token = jwt.sign(claims, secret.trim());
    const input = {
      ...body,
      token: (body as any).token === undefined ? token : (body as any).token,
    };
    const authorization =
      _name === 'matching dual'
        ? `Bearer ${token}`
        : _name === 'mismatched dual'
          ? `Bearer ${jwt.sign({ ...claims, jti: 'header-token' }, secret.trim())}`
          : undefined;
    await expect(
      service.handleCallback(42, input, authorization),
    ).resolves.toEqual({ error: accepted ? 0 : 1 });
    if (!accepted) expectNoDownstreamWork(context);
  });

  it('proves both mismatched tokens are independently valid', () => {
    const header = jwt.sign({ ...claims, jti: 'header-token' }, secret.trim());
    const body = jwt.sign({ ...claims, jti: 'body-token' }, secret.trim());
    expect(header).not.toBe(body);
    expect(
      jwt.verify(header, secret.trim(), { algorithms: ['HS256'] }),
    ).toEqual(expect.objectContaining(claims));
    expect(jwt.verify(body, secret.trim(), { algorithms: ['HS256'] })).toEqual(
      expect.objectContaining(claims),
    );
  });

  it.each([undefined, '', '   '] as const)(
    'rejects secret %p',
    async (configuredSecret) => {
      const context = createService(configuredSecret);
      await expect(
        context.service.handleCallback(42, { token: 'not.a.jwt' }),
      ).resolves.toEqual({ error: 1 });
      expect(jwt.verify).not.toHaveBeenCalled();
      expectNoDownstreamWork(context);
    },
  );

  it.each([
    ['malformed', 'not.a.jwt'],
    ['expired', jwt.sign(claims, secret.trim(), { expiresIn: -1 })],
    ['not-before', jwt.sign(claims, secret.trim(), { notBefore: 60 })],
    [
      'wrong algorithm',
      jwt.sign(claims, secret.trim(), { algorithm: 'HS384' }),
    ],
    [
      'unsigned',
      `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.`,
    ],
  ] as const)('rejects %s JWT', async (_name, token) => {
    const context = createService();
    await expect(
      context.service.handleCallback(42, { token }),
    ).resolves.toEqual({
      error: 1,
    });
    expectNoDownstreamWork(context);
  });

  it('accepts nested claims and proves the HS256 verifier guard', async () => {
    const { service } = createService();
    const verify = jwt.verify as jest.Mock;
    verify.mockClear();
    const token = jwt.sign({ payload: claims }, secret.trim(), {
      algorithm: 'HS256',
    });
    await expect(service.handleCallback(42, { token })).resolves.toEqual({
      error: 0,
    });
    expect(verify).toHaveBeenCalledWith(token, secret.trim(), {
      algorithms: ['HS256'],
    });
  });

  it('cleans up the moved file when a duplicate receipt is detected', async () => {
    const context = createService();
    context.config.get.mockImplementation((key: string) =>
      key === 'ONLYOFFICE_SECRET' ? secret : 'https://onlyoffice.test',
    );
    context.prisma.document.findUnique.mockResolvedValue({
      uploadedById: 'owner-1',
      categoryId: 2,
      versions: [{ filename: 'file.docx', storedName: 'file.docx', mimetype: 'application/docx' }],
    });
    context.storage.getPaths.mockReturnValue({ temp: '/tmp' });
    context.storage.generateStructuredPath.mockReturnValue({ path: '/stored/new.docx' });
    context.fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue('3') },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    context.prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        onlyofficeCallbackReceipt: {
          create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        },
      }),
    );
    jest.spyOn(context.service as any, 'isAuthorizedEditor').mockResolvedValue(true);
    const token = jwt.sign(
      { status: 2, key: 'doc_42_save_1', url: 'https://onlyoffice.test/file', users: ['editor-1'] },
      secret.trim(),
    );

    await expect(
      context.service.handleCallback(42, { token }),
    ).resolves.toEqual({ error: 0 });
    expect(context.storage.deleteFile).toHaveBeenCalledWith('/stored/new.docx');
  });

  it.each([
    ['unsupported status', { ...claims, status: 5 }],
    ['route key mismatch', { ...claims, key: 'doc_7_save_1' }],
    ['document mismatch', { ...claims, documentId: 7 }],
    ['status 2 without identity', { status: 2, key: claims.key }],
    ['body disagreement', claims],
  ] as const)('rejects %s claims', async (_name, signedClaims) => {
    const context = createService();
    const { service } = context;
    const token = jwt.sign(signedClaims, secret.trim());
    const body =
      _name === 'body disagreement' ? { token, status: 2 } : { token };
    jest.clearAllMocks();
    await expect(service.handleCallback(42, body)).resolves.toEqual({
      error: 1,
    });
    expectNoDownstreamWork(context);
  });
});

describe('OnlyofficeService editor authorization', () => {
  it('does not grant edit mode to a read-only user', () => {
    const config = { get: jest.fn().mockReturnValue('http://onlyoffice.test') };
    const service = new OnlyofficeService(
      config as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      extractionMock() as never,
      directoryMock() as never,
      pdfOcrMock() as never,
    );

    const result = service.generateEditorConfig(
      { id: 42, title: 'file.docx', fileType: 'docx', callbackHost: '' },
      { id: 'reader', name: 'Reader' },
      false,
    );

    expect(result.document.permissions.edit).toBe(false);
    expect(result.editorConfig.mode).toBe('view');
  });

  it('grants edit mode to an authorized editor', () => {
    const config = { get: jest.fn().mockReturnValue('http://onlyoffice.test') };
    const service = new OnlyofficeService(
      config as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      extractionMock() as never,
      directoryMock() as never,
      pdfOcrMock() as never,
    );

    const result = service.generateEditorConfig(
      { id: 42, title: 'file.docx', fileType: 'docx', callbackHost: '' },
      { id: 'editor', name: 'Editor' },
      true,
    );

    expect(result.document.permissions.edit).toBe(true);
    expect(result.editorConfig.mode).toBe('edit');
  });
});

describe('OnlyofficeService.createBlankDocument', () => {
  let service: OnlyofficeService;
  let storage: {
    generateStructuredPath: jest.Mock;
    moveFile: jest.Mock;
    calculateFileHash: jest.Mock;
  };
  let prisma: {
    academicYear: { findFirst: jest.Mock };
    documentType: { findFirst: jest.Mock; findUnique: jest.Mock };
    document: { create: jest.Mock };
  };
  let thumbnailService: { regenerateThumbnail: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    storage = {
      generateStructuredPath: jest.fn(() => ({
        path: '/uploads/structured/archivo.txt',
      })),
      moveFile: jest.fn(),
      calculateFileHash: jest.fn(async () => 'checksum-test'),
    };
    prisma = {
      academicYear: { findFirst: jest.fn(async () => null) },
      documentType: {
        findFirst: jest.fn(async () => ({
          id: 7,
          isActive: true,
          categoryId: 11,
        })),
        findUnique: jest.fn(),
      },
      document: { create: jest.fn(async () => ({ id: 42 })) },
    };
    thumbnailService = { regenerateThumbnail: jest.fn(async () => undefined) };
    service = new OnlyofficeService(
      {} as ConfigService,
      storage as never,
      prisma as never,
      thumbnailService as never,
      extractionMock() as never,
      directoryMock() as never,
      pdfOcrMock() as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['txt', 'text/plain', 'Notas.txt', '.txt'],
    ['md', 'text/markdown', 'Notas.md', '.md'],
  ] as const)(
    'creates a blank .%s document with %s mimetype',
    async (fileType, mimetype, filename, extension) => {
      storage.generateStructuredPath.mockReturnValue({
        path: `/uploads/structured/${filename}`,
      });

      const dto = { title: 'Notas', fileType } as CreateBlankDocumentDto;
      const result = await service.createBlankDocument(dto, 'user-1');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^uploads.*temp.*[0-9a-f-]{36}\\${extension}$`),
        ),
        Buffer.alloc(0),
      );
      expect(storage.generateStructuredPath).toHaveBeenCalledWith(
        'user-1',
        null,
        expect.stringMatching(new RegExp(`^[0-9a-f-]{36}\\${extension}$`)),
      );
      expect(storage.moveFile).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`^uploads.*temp.*[0-9a-f-]{36}\\${extension}$`),
        ),
        `/uploads/structured/${filename}`,
      );
      expect(storage.calculateFileHash).toHaveBeenCalledWith(
        `/uploads/structured/${filename}`,
      );

      const version =
        prisma.document.create.mock.calls[0][0].data.versions.create;
      expect(version.filename).toBe(filename);
      expect(version.mimetype).toBe(mimetype);
      expect(version.storedName).toMatch(
        new RegExp(`^[0-9a-f-]{36}\\${extension}$`),
      );
      expect(version.size).toBe(0);
      expect(version.comment).toBe('Created in editor');
      expect(version.source).toBe('UPLOAD_INICIAL');
      expect(result.id).toBe(42);
    },
  );

  it('creates a generic blank document without consulting a default type', async () => {
    const dto = { title: 'Notas', fileType: 'txt' } as CreateBlankDocumentDto;

    await service.createBlankDocument(dto, 'user-1');

    expect(prisma.documentType.findFirst).not.toHaveBeenCalled();
    expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
    const data = prisma.document.create.mock.calls[0][0].data;
    expect(data.documentTypeId).toBeNull();
    expect(data.categoryId).toBeNull();
  });

  it('validates an explicit concrete type and derives its category', async () => {
    prisma.documentType.findUnique.mockResolvedValue({
      id: 7,
      isActive: true,
      categoryId: 11,
    });

    await service.createBlankDocument(
      { title: 'Notas', fileType: 'txt', documentTypeId: 7 },
      'user-1',
    );

    expect(prisma.documentType.findFirst).not.toHaveBeenCalled();
    expect(prisma.documentType.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true, isActive: true, categoryId: true },
    });
    const data = prisma.document.create.mock.calls[0][0].data;
    expect(data.documentTypeId).toBe(7);
    expect(data.categoryId).toBe(11);
  });
});

describe('OnlyofficeService server-owned content indexing', () => {
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const secret = 'synthetic-secret';
  let service: OnlyofficeService;
  let extractor: ReturnType<typeof extractionMock>;
  let pdfOcr: ReturnType<typeof pdfOcrMock>;
  let prisma: any;
  let tx: any;
  let storage: any;
  let fetchMock: jest.Mock;
  let token: string;

  beforeEach(() => {
    jest.clearAllMocks();
    extractor = extractionMock();
    pdfOcr = pdfOcrMock();
    const document = {
      uploadedById: 'owner', categoryId: 11,
      currentVersion: 3,
      versions: [{ id: 30, version: 3, filename: 'synthetic.docx', mimetype: mime }],
    };
    tx = {
      onlyofficeCallbackReceipt: { create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      documentVersion: { create: jest.fn().mockResolvedValue({ id: 77 }), update: jest.fn().mockResolvedValue({}) },
      documentAccess: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      document: { findUnique: jest.fn().mockResolvedValue(document), create: jest.fn().mockResolvedValue({ id: 42 }) },
      user: tx.user,
      documentWorkflow: tx.documentWorkflow,
      academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
      documentType: { findFirst: jest.fn().mockResolvedValue({ id: 7, categoryId: 11, isActive: true }) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    storage = {
      getPaths: jest.fn().mockReturnValue({ temp: '/synthetic/temp' }),
      generateStructuredPath: jest.fn().mockReturnValue({ path: '/synthetic/staged.docx' }),
      moveFile: jest.fn(), deleteFile: jest.fn(),
      calculateFileHash: jest.fn().mockResolvedValue('checksum'),
    };
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: jest.fn((name: string) => name === 'content-type' ? `${mime}; charset=utf-8` : '3') },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    global.fetch = fetchMock as typeof fetch;
    service = new OnlyofficeService(
      { get: (name: string) => name === 'ONLYOFFICE_SECRET' ? secret : 'https://onlyoffice.test' } as any,
      storage, prisma, { regenerateThumbnail: jest.fn().mockResolvedValue(undefined) } as any, extractor as never,
      directoryMock() as never,
      pdfOcr as never,
    );
    token = jwt.sign({ status: 2, key: 'doc_42_synthetic', url: 'https://onlyoffice.test/file', users: ['owner'] }, secret);
  });

  afterEach(() => jest.restoreAllMocks());

  it('records OnlyOffice supersession under its existing document lock', async () => {
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
    expect(tx.documentVersion.update).toHaveBeenCalledWith({ where: { id: 30 }, data: { supersededAt: expect.any(Date) } });
    expect(tx.$queryRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(tx.documentVersion.update.mock.invocationCallOrder[0]);
    expect(tx.documentVersion.update.mock.invocationCallOrder[0]).toBeLessThan(tx.documentVersion.create.mock.invocationCallOrder[0]);
  });

  it.each(['server text', null, ''])(
    'refreshes callback search atomically with nullable text %p', async (text) => {
      extractor.extractFromFile.mockResolvedValue(text);
      await expect(service.handleCallback(42, { token, search: { extractedText: 'forged' } })).resolves.toEqual({ error: 0 });
      expect(extractor.extractFromFile).toHaveBeenCalledWith('/synthetic/staged.docx', mime);
      expect(storage.moveFile.mock.invocationCallOrder[0]).toBeLessThan(extractor.extractFromFile.mock.invocationCallOrder[0]);
      expect(extractor.extractFromFile.mock.invocationCallOrder[0]).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
      expect(tx.document.update).toHaveBeenCalledWith({
        where: { id: 42 }, data: {
          currentVersion: 4, checksumSHA256: expect.any(String),
          search: { upsert: { create: { extractedText: text }, update: { extractedText: text } } },
        },
      });
      expect(prisma.document.create).not.toHaveBeenCalled();
    },
  );

  it.each([['text/plain; charset=utf-8', 'text/plain'], [null, mime]])(
    'uses the downloaded MIME or existing fallback %p for staged extraction', async (header, expectedMime) => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: (name: string) => name === 'content-type' ? header : '3' },
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      });
      await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
      expect(extractor.extractFromFile).toHaveBeenCalledWith('/synthetic/staged.docx', expectedMime);
    },
  );

  it('falls back to null if the extractor unexpectedly rejects', async () => {
    extractor.extractFromFile.mockRejectedValue(new Error('synthetic failure'));
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
    expect(tx.document.update.mock.calls[0][0].data.search.upsert.update).toEqual({ extractedText: null });
  });

  it('cleans staging on transaction failure after the nested search write', async () => {
    extractor.extractFromFile.mockResolvedValue('synthetic text');
    tx.documentAccess.create.mockRejectedValue(new Error('synthetic rollback'));
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 1 });
    expect(tx.document.update.mock.calls[0][0].data.search.upsert.create).toEqual({ extractedText: 'synthetic text' });
    expect(storage.deleteFile).toHaveBeenCalledWith('/synthetic/staged.docx');
  });

  it('does not write search or versions when a duplicate receipt rejects', async () => {
    tx.onlyofficeCallbackReceipt.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
    expect(tx.document.update).not.toHaveBeenCalled();
    expect(tx.documentVersion.create).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('/synthetic/staged.docx');
  });

  it.each(['signature', 'permission', 'origin', 'resource', 'size'])(
    'does not parse before the %s gate succeeds', async (gate) => {
      if (gate === 'signature') token = 'invalid';
      if (gate === 'permission') prisma.user.findUnique.mockResolvedValue(null);
      if (gate === 'origin') token = jwt.sign({ status: 2, key: 'doc_42_synthetic', url: 'https://foreign.test/file', users: ['owner'] }, secret);
      if (gate === 'resource') prisma.document.findUnique.mockResolvedValue(null);
      if (gate === 'size') fetchMock.mockResolvedValue({ ok: true, headers: { get: () => String(51 * 1024 * 1024) } });
      await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 1 });
      expect(extractor.extractFromFile).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('retains the locked authorization recheck before search writes', async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' }).mockResolvedValue(null);
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 1 });
    expect(tx.document.update).not.toHaveBeenCalled();
  });

  it.each([
    ['docx', mime, 'generated text'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ''],
    ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', null],
    ['txt', 'text/plain', ''],
    ['md', 'text/markdown', null],
  ] as const)('initializes blank %s search from generated server bytes', async (fileType, mimetype, text) => {
    extractor.extractFromFile.mockResolvedValue(text);
    await service.createBlankDocument({ title: 'Synthetic', fileType, search: { extractedText: 'forged' } } as any, 'owner');
    expect(extractor.extractFromFile).toHaveBeenCalledWith('/synthetic/staged.docx', mimetype);
    expect(prisma.document.create.mock.calls[0][0].data.search).toEqual({ create: { extractedText: text } });
    expect(prisma.document.create.mock.calls[0][0].data.versions.create.mimetype).toBe(mimetype);
  });

  it('initializes metadata-only blank search on unexpected extraction rejection', async () => {
    extractor.extractFromFile.mockRejectedValue(new Error('synthetic failure'));
    await service.createBlankDocument({ title: 'Synthetic', fileType: 'docx' }, 'owner');
    expect(prisma.document.create.mock.calls[0][0].data.search).toEqual({ create: { extractedText: null } });
  });

  it('enqueues post-commit OCR for the committed callback version', async () => {
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
    expect(pdfOcr.enqueue).toHaveBeenCalledTimes(1);
    expect(pdfOcr.enqueue).toHaveBeenCalledWith({
      documentId: 42,
      currentVersion: 4,
      versionRowId: 77,
      checksumSHA256: expect.any(String),
      path: '/synthetic/staged.docx',
      mimetype: mime,
      digitalText: null,
    });
  });

  it('does not enqueue OCR when the callback transaction rolls back', async () => {
    tx.documentAccess.create.mockRejectedValue(new Error('synthetic rollback'));
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 1 });
    expect(pdfOcr.enqueue).not.toHaveBeenCalled();
  });

  it('preserves the callback response when OCR admission throws', async () => {
    pdfOcr.enqueue.mockImplementation(() => { throw new Error('queue unavailable'); });
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
  });

  it('delegates non-PDF callback results to the admission gate', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: jest.fn((name: string) => name === 'content-type' ? 'text/plain; charset=utf-8' : '3') },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    await expect(service.handleCallback(42, { token })).resolves.toEqual({ error: 0 });
    expect(pdfOcr.enqueue).toHaveBeenCalledWith(expect.objectContaining({ mimetype: 'text/plain' }));
  });
});

describe('OnlyofficeService issuance-bound reception sessions', () => {
  const secret = 'issuance-secret';
  const mime =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const receptionDocument = {
    id: 42,
    uploadedById: 'author',
    directoryId: 2,
    receptionOriginDirectoryId: 2,
    categoryId: 11,
    currentVersion: 1,
    deletedAt: null,
    versions: [
      { id: 5, version: 1, filename: 'r.docx', storedName: 'r.docx', mimetype: mime },
    ],
  };

  function fixture(document: any = receptionDocument) {
    jest.clearAllMocks();
    const directoryService = directoryMock();
    const tx: any = {
      onlyofficeCallbackReceipt: { create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'author', role: 'USER' }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      documentVersion: { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) },
      documentAccess: { create: jest.fn().mockResolvedValue({}) },
      directory: { findUnique: jest.fn().mockResolvedValue({ id: 2, receptionEnabled: true }) },
      workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        findFirst: jest.fn().mockResolvedValue({ id: document.id }),
        create: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'author', role: 'USER' }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      directory: { findUnique: jest.fn().mockResolvedValue({ id: 2, receptionEnabled: true }) },
      workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const storage: any = {
      getPaths: jest.fn().mockReturnValue({ temp: '/tmp' }),
      generateStructuredPath: jest.fn().mockReturnValue({ path: '/stored/r.docx' }),
      moveFile: jest.fn(),
      deleteFile: jest.fn(),
      calculateFileHash: jest.fn().mockResolvedValue('checksum'),
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? `${mime}; charset=utf-8` : '3',
      },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    global.fetch = fetchMock as typeof fetch;
    const service = new OnlyofficeService(
      {
        get: (name: string) =>
          name === 'ONLYOFFICE_SECRET' ? secret : 'https://onlyoffice.test',
      } as any,
      storage,
      prisma,
      { regenerateThumbnail: jest.fn().mockResolvedValue(undefined) } as any,
      extractionMock() as never,
      directoryService as never,
      pdfOcrMock() as never,
    );
    return { service, prisma, tx, storage, fetchMock, directoryService };
  }

  const signedCallback = (overrides: Record<string, unknown> = {}) =>
    jwt.sign(
      {
        status: 2,
        key: 'doc_42_session',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
        ...overrides,
      },
      secret,
    );

  it('binds the editor session to a unique key and actor-scoped issuance token', () => {
    const { service } = fixture();
    const config = service.generateEditorConfig(
      { id: 42, title: 'r.docx', fileType: 'docx', callbackHost: '' },
      { id: 'author', name: 'Author' },
      true,
    );
    const fileToken = new URL(config.document.url).searchParams.get('token');
    const issuanceToken = new URL(
      config.editorConfig.callbackUrl,
    ).searchParams.get('issuance');
    expect(config.document.key).toMatch(/^doc_42_[A-Za-z0-9_-]+$/);
    expect(fileToken).toBe(issuanceToken);
    expect(service.verifyIssuanceToken(issuanceToken, 42)).toMatchObject({
      documentId: 42,
      key: config.document.key,
      userId: 'author',
      canEdit: true,
    });
  });

  it('generates collision-safe document keys across emissions', () => {
    const { service } = fixture();
    const args = [
      { id: 42, title: 'r.docx', fileType: 'docx', callbackHost: '' },
      { id: 'author', name: 'Author' },
      true,
    ] as const;
    const first = service.generateEditorConfig(args[0], args[1], args[2]);
    const second = service.generateEditorConfig(args[0], args[1], args[2]);
    expect(first.document.key).not.toBe(second.document.key);
  });

  it('rejects a view-only issuance token for a reception save', async () => {
    const { service } = fixture();
    const issuance = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'author', canEdit: false },
      secret,
    );
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 1 });
  });

  it('fails closed when a reception callback lacks an issuance token', async () => {
    const { service, fetchMock, storage } = fixture();
    await expect(service.handleCallback(42, { token: signedCallback() })).resolves.toEqual(
      { error: 1 },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.moveFile).not.toHaveBeenCalled();
  });

  it('rejects a spoofed actor that disagrees with the issuance token', async () => {
    const { service } = fixture();
    const issuance = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'other', canEdit: true },
      secret,
    );
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 1 });
  });

  it('rejects a key mismatch between the issuance and the signed callback', async () => {
    const { service } = fixture();
    const issuance = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_other', userId: 'author', canEdit: true },
      secret,
    );
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 1 });
  });

  it('fails closed when the author is revoked after issuance', async () => {
    const { service, directoryService } = fixture();
    directoryService.assertDocumentMutation.mockRejectedValue(
      new Error('revoked'),
    );
    const issuance = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'author', canEdit: true },
      secret,
    );
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 1 });
  });

  it('accepts an issuance-bound author save and records the version', async () => {
    const { service, tx, directoryService } = fixture();
    const issuance = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'author', canEdit: true },
      secret,
    );
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 0 });
    expect(directoryService.assertDocumentMutation).toHaveBeenCalled();
    expect(tx.documentVersion.create).toHaveBeenCalled();
  });

  it('keeps ordinary legacy callbacks working without issuance', async () => {
    const ordinary = {
      id: 7,
      uploadedById: 'author',
      directoryId: null,
      receptionOriginDirectoryId: null,
      categoryId: 11,
      currentVersion: 1,
      deletedAt: null,
      versions: [
        { id: 9, version: 1, filename: 'o.docx', storedName: 'o.docx', mimetype: mime },
      ],
    };
    const { service, tx } = fixture(ordinary);
    const token = jwt.sign(
      {
        status: 2,
        key: 'doc_7_legacy',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
      },
      secret,
    );
    await expect(service.handleCallback(7, { token })).resolves.toEqual({
      error: 0,
    });
    expect(tx.documentVersion.create).toHaveBeenCalled();
  });

  const issuanceFor = (userId = 'author', canEdit = true) =>
    jwt.sign(
      {
        purpose: 'onlyoffice-editor',
        documentId: 42,
        key: 'doc_42_session',
        userId,
        canEdit,
      },
      secret,
    );

  it('runs the reception final write under a serializable transaction', async () => {
    const { service, prisma } = fixture();
    const issuance = issuanceFor();
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 0 });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('runs an ordinary final write under a serializable transaction', async () => {
    const ordinary = {
      id: 7,
      uploadedById: 'author',
      directoryId: null,
      receptionOriginDirectoryId: null,
      categoryId: 11,
      currentVersion: 1,
      deletedAt: null,
      versions: [
        { id: 9, version: 1, filename: 'o.docx', storedName: 'o.docx', mimetype: mime },
      ],
    };
    const { service, prisma } = fixture(ordinary);
    const token = jwt.sign(
      {
        status: 2,
        key: 'doc_7_legacy',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
      },
      secret,
    );
    await expect(service.handleCallback(7, { token })).resolves.toEqual({
      error: 0,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('fails closed and compensates staging on a serialization conflict', async () => {
    const { service, prisma, storage } = fixture();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    const issuance = issuanceFor();
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 1 });
    expect(storage.deleteFile).toHaveBeenCalledWith('/stored/r.docx');
  });

  it('fails closed when reception authorization is revoked between preflight and the locked write', async () => {
    const { service, tx, storage, directoryService } = fixture();
    directoryService.assertDocumentMutation
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('revoked'));
    const issuance = issuanceFor();
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 1 });
    expect(directoryService.assertDocumentMutation).toHaveBeenCalledTimes(2);
    expect(tx.documentVersion.create).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('/stored/r.docx');
  });

  it('fails closed when an ordinary author is removed between preflight and the locked write', async () => {
    const ordinary = {
      id: 7,
      uploadedById: 'author',
      directoryId: null,
      receptionOriginDirectoryId: null,
      categoryId: 11,
      currentVersion: 1,
      deletedAt: null,
      versions: [
        { id: 9, version: 1, filename: 'o.docx', storedName: 'o.docx', mimetype: mime },
      ],
    };
    const { service, tx, storage } = fixture(ordinary);
    tx.user.findUnique.mockResolvedValue(null);
    const token = jwt.sign(
      {
        status: 2,
        key: 'doc_7_legacy',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
      },
      secret,
    );
    await expect(service.handleCallback(7, { token })).resolves.toEqual({
      error: 1,
    });
    expect(tx.documentVersion.create).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('/stored/r.docx');
  });

  it('fails closed for an ordinary callback when the document is not accessible', async () => {
    const inaccessible = {
      id: 7,
      uploadedById: 'other',
      directoryId: null,
      receptionOriginDirectoryId: null,
      categoryId: 11,
      currentVersion: 1,
      deletedAt: null,
      versions: [
        { id: 9, version: 1, filename: 'o.docx', storedName: 'o.docx', mimetype: mime },
      ],
    };
    const { service, tx } = fixture(inaccessible);
    const token = jwt.sign(
      {
        status: 2,
        key: 'doc_7_legacy',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
      },
      secret,
    );
    await expect(service.handleCallback(7, { token })).resolves.toEqual({
      error: 1,
    });
    expect(tx.documentVersion.create).not.toHaveBeenCalled();
  });

  it('fails closed for a legacy callback once the document has become reception', async () => {
    const { service, storage } = fixture();
    const token = jwt.sign(
      {
        status: 2,
        key: 'doc_42_session',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
      },
      secret,
    );
    await expect(service.handleCallback(42, { token })).resolves.toEqual({
      error: 1,
    });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('keeps a duplicate reception receipt idempotent without writes', async () => {
    const { service, tx, storage } = fixture();
    tx.onlyofficeCallbackReceipt.create.mockRejectedValue({ code: 'P2002' });
    const issuance = issuanceFor();
    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuance),
    ).resolves.toEqual({ error: 0 });
    expect(tx.documentVersion.create).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('/stored/r.docx');
  });

  it.each([
    ['wrong purpose', { purpose: 'other' }],
    ['empty actor', { userId: '' }],
    ['empty key', { key: '' }],
    ['non-boolean edit', { canEdit: 'yes' }],
    ['non-integer document', { documentId: '42' }],
  ] as const)('rejects a malformed issuance token: %s', (_name, overrides) => {
    const { service } = fixture();
    const token = jwt.sign(
      {
        purpose: 'onlyoffice-editor',
        documentId: 42,
        key: 'doc_42_session',
        userId: 'author',
        canEdit: true,
        ...overrides,
      },
      secret,
    );
    expect(service.verifyIssuanceToken(token, 42)).toBeNull();
  });

  it.each([
    ['expired', { expiresIn: -1 }],
    ['not-before', { notBefore: 60 }],
  ] as const)('rejects an %s issuance token', (_name, options) => {
    const { service } = fixture();
    const token = jwt.sign(
      {
        purpose: 'onlyoffice-editor',
        documentId: 42,
        key: 'doc_42_session',
        userId: 'author',
        canEdit: true,
      },
      secret,
      options,
    );
    expect(service.verifyIssuanceToken(token, 42)).toBeNull();
  });

  it('rejects an issuance token substituted for another document', () => {
    const { service } = fixture();
    const token = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'author', canEdit: true },
      secret,
    );
    expect(service.verifyIssuanceToken(token, 7)).toBeNull();
  });

  it('fails closed for a wrong-purpose issuance on a reception callback', async () => {
    const { service, storage } = fixture();
    const wrongPurpose = jwt.sign(
      {
        purpose: 'other',
        documentId: 42,
        key: 'doc_42_session',
        userId: 'author',
        canEdit: true,
      },
      secret,
    );
    await expect(
      service.handleCallback(
        42,
        { token: signedCallback() },
        undefined,
        wrongPurpose,
      ),
    ).resolves.toEqual({ error: 1 });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});

describe('OnlyofficeService live file access', () => {
  const secret = 'file-access-secret';
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function fixture(document: any) {
    jest.clearAllMocks();
    const prisma: any = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        findFirst: jest.fn().mockResolvedValue({ id: document.id }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'author', role: 'USER' }) },
      directory: { findUnique: jest.fn().mockResolvedValue({ id: 2, receptionEnabled: true }) },
    };
    const service = new OnlyofficeService(
      {
        get: (name: string) =>
          name === 'ONLYOFFICE_SECRET' ? secret : 'https://onlyoffice.test',
      } as any,
      {} as never,
      prisma as never,
      {} as never,
      extractionMock() as never,
      directoryMock() as never,
      pdfOcrMock() as never,
    );
    return { service, prisma };
  }

  const reception = {
    id: 42,
    uploadedById: 'author',
    directoryId: 2,
    receptionOriginDirectoryId: 2,
    versions: [
      { id: 5, version: 1, filename: 'r.docx', storedName: 'r.docx', mimetype: mime, path: '/stored/r.docx' },
    ],
  };

  it('rechecks the live reader for an issuance-bound file token', async () => {
    const { service, prisma } = fixture(reception);
    const token = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'author', canEdit: false },
      secret,
    );
    await expect(service.resolveFileAccess(42, token)).resolves.toMatchObject({
      version: expect.objectContaining({ path: '/stored/r.docx' }),
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'author' },
      select: { role: true },
    });
    expect(prisma.document.findFirst).toHaveBeenCalled();
  });

  it('rejects an issuance-bound token whose actor was revoked', async () => {
    const { service, prisma } = fixture(reception);
    prisma.user.findUnique.mockResolvedValue(null);
    const token = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'ghost', canEdit: true },
      secret,
    );
    await expect(service.resolveFileAccess(42, token)).resolves.toBeNull();
  });

  it('fails closed when a legacy id-only token targets a reception document', async () => {
    const { service } = fixture(reception);
    const legacy = service.generateFileToken(42, secret);
    await expect(service.resolveFileAccess(42, legacy)).resolves.toBeNull();
  });

  it('keeps legacy ordinary file tokens compatible', async () => {
    const ordinary = {
      id: 9,
      uploadedById: 'author',
      directoryId: null,
      receptionOriginDirectoryId: null,
      versions: [
        { id: 3, version: 1, filename: 'o.docx', storedName: 'o.docx', mimetype: mime, path: '/stored/o.docx' },
      ],
    };
    const { service } = fixture(ordinary);
    const legacy = service.generateFileToken(9, secret);
    await expect(service.resolveFileAccess(9, legacy)).resolves.toMatchObject({
      version: expect.objectContaining({ path: '/stored/o.docx' }),
    });
  });

  it('rejects an issuance-bound token when the document is no longer accessible', async () => {
    const { service, prisma } = fixture(reception);
    prisma.document.findFirst.mockResolvedValue(null);
    const token = service.generateIssuanceToken(
      { documentId: 42, key: 'doc_42_session', userId: 'author', canEdit: false },
      secret,
    );
    await expect(service.resolveFileAccess(42, token)).resolves.toBeNull();
  });

  it('fails closed for a legacy token after a durable reception origin move', async () => {
    const moved = {
      id: 42,
      uploadedById: 'author',
      directoryId: null,
      receptionOriginDirectoryId: 2,
      versions: [
        { id: 5, version: 1, filename: 'r.docx', storedName: 'r.docx', mimetype: mime, path: '/stored/r.docx' },
      ],
    };
    const { service } = fixture(moved);
    await expect(
      service.resolveFileAccess(42, service.generateFileToken(42, secret)),
    ).resolves.toBeNull();
  });

  it('does not serve a wrong-purpose or malformed issuance-like token via the legacy fallback', async () => {
    const ordinary = {
      id: 9,
      uploadedById: 'author',
      directoryId: null,
      receptionOriginDirectoryId: null,
      versions: [
        { id: 3, version: 1, filename: 'o.docx', storedName: 'o.docx', mimetype: mime, path: '/stored/o.docx' },
      ],
    };
    const { service } = fixture(ordinary);
    const wrongPurpose = jwt.sign(
      { purpose: 'other', documentId: 9 },
      secret,
    );
    await expect(service.resolveFileAccess(9, wrongPurpose)).resolves.toBeNull();
    const malformedIssuance = jwt.sign(
      { purpose: 'onlyoffice-editor', documentId: 9 },
      secret,
    );
    await expect(
      service.resolveFileAccess(9, malformedIssuance),
    ).resolves.toBeNull();
  });
});

// T5b: la nueva versión del callback se liga a la corrección vigente de un workflow
// del MISMO documento en CHANGES_REQUESTED y avanza su versión ligada. Sin ese
// workflow se conserva la fuente y el comportamiento ordinarios; un workflow
// terminado o ajeno nunca se revivifica ni se sobrescribe.
describe('OnlyofficeService correction version binding', () => {
  const secret = 'correction-secret';
  const mime =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const receptionDocument = {
    id: 42,
    uploadedById: 'author',
    directoryId: 2,
    receptionOriginDirectoryId: 2,
    categoryId: 11,
    currentVersion: 1,
    deletedAt: null,
    versions: [
      { id: 5, version: 1, filename: 'r.docx', storedName: 'r.docx', mimetype: mime },
    ],
  };

  function fixture(document: any = receptionDocument) {
    jest.clearAllMocks();
    const tx: any = {
      onlyofficeCallbackReceipt: { create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      document: { findUnique: jest.fn().mockResolvedValue(document), update: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'author', role: 'USER' }) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
      documentVersion: { create: jest.fn().mockResolvedValue({ id: 88 }), update: jest.fn().mockResolvedValue({}) },
      documentAccess: { create: jest.fn().mockResolvedValue({}) },
      directory: { findUnique: jest.fn().mockResolvedValue({ id: 2, receptionEnabled: true }) },
      workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = {
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
        findFirst: jest.fn().mockResolvedValue({ id: document.id }),
        create: jest.fn(),
      },
      user: tx.user,
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      directory: tx.directory,
      workflowApproval: tx.workflowApproval,
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const storage: any = {
      getPaths: jest.fn().mockReturnValue({ temp: '/synthetic/temp' }),
      generateStructuredPath: jest.fn().mockReturnValue({ path: '/synthetic/staged.docx' }),
      moveFile: jest.fn(),
      deleteFile: jest.fn(),
      calculateFileHash: jest.fn().mockResolvedValue('checksum'),
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? `${mime}; charset=utf-8` : '3',
      },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    });
    global.fetch = fetchMock as typeof fetch;
    const pdfOcr = pdfOcrMock();
    const directoryService = directoryMock();
    const service = new OnlyofficeService(
      {
        get: (name: string) =>
          name === 'ONLYOFFICE_SECRET' ? secret : 'https://onlyoffice.test',
      } as any,
      storage,
      prisma,
      { regenerateThumbnail: jest.fn().mockResolvedValue(undefined) } as any,
      extractionMock() as never,
      directoryService as never,
      pdfOcr as never,
    );
    return { service, prisma, tx, storage, fetchMock, directoryService, pdfOcr };
  }

  const issuanceFor = () =>
    jwt.sign(
      {
        purpose: 'onlyoffice-editor',
        documentId: 42,
        key: 'doc_42_correction',
        userId: 'author',
        canEdit: true,
      },
      secret,
    );
  const signedCallback = () =>
    jwt.sign(
      {
        status: 2,
        key: 'doc_42_correction',
        url: 'https://onlyoffice.test/file',
        users: ['author'],
      },
      secret,
    );

  it('binds a callback save to the active changes-requested workflow of the same document', async () => {
    const { service, tx } = fixture();
    tx.documentWorkflow.findFirst.mockResolvedValue({ id: 3 });

    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuanceFor()),
    ).resolves.toEqual({ error: 0 });

    expect(tx.documentWorkflow.findFirst).toHaveBeenCalledWith({
      where: { documentId: 42, active: true, status: 'CHANGES_REQUESTED' },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const lockCalls = tx.$queryRawUnsafe.mock.calls.map((call: any[]) => String(call[0]));
    const docLock = lockCalls.findIndex((sql) => sql.includes('"Document"'));
    const wfLock = lockCalls.findIndex((sql) => sql.includes('"DocumentWorkflow"'));
    expect(docLock).toBe(0);
    expect(docLock).toBeLessThan(wfLock);
    expect(tx.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'CAMBIOS_SOLICITADOS', workflowId: 3 }),
      }),
    );
    expect(tx.documentWorkflow.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { documentVersionId: 88 },
    });
  });

  it('keeps the ordinary source when no changes-requested workflow exists', async () => {
    const { service, tx } = fixture();
    tx.documentWorkflow.findFirst.mockResolvedValue(null);

    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuanceFor()),
    ).resolves.toEqual({ error: 0 });

    expect(tx.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'REEMPLAZO_MANUAL', workflowId: null }),
      }),
    );
    expect(tx.documentWorkflow.update).not.toHaveBeenCalled();
  });

  it('never revives a terminated workflow because only an active changes-requested one matches', async () => {
    const { service, tx } = fixture();
    tx.documentWorkflow.findFirst.mockResolvedValue(null);

    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuanceFor()),
    ).resolves.toEqual({ error: 0 });

    expect(tx.documentWorkflow.update).not.toHaveBeenCalled();
  });

  it('does not commit the binding and never enqueues OCR when the callback transaction rolls back', async () => {
    const { service, tx, storage, pdfOcr } = fixture();
    tx.documentWorkflow.findFirst.mockResolvedValue({ id: 3 });
    tx.documentAccess.create.mockRejectedValue(new Error('rollback'));

    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuanceFor()),
    ).resolves.toEqual({ error: 1 });

    expect(storage.deleteFile).toHaveBeenCalledWith('/synthetic/staged.docx');
    expect(pdfOcr.enqueue).not.toHaveBeenCalled();
  });

  it('keeps a duplicate receipt idempotent without touching the workflow', async () => {
    const { service, tx, storage } = fixture();
    tx.onlyofficeCallbackReceipt.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.handleCallback(42, { token: signedCallback() }, undefined, issuanceFor()),
    ).resolves.toEqual({ error: 0 });

    expect(tx.documentWorkflow.findFirst).not.toHaveBeenCalled();
    expect(tx.documentVersion.create).not.toHaveBeenCalled();
    expect(tx.documentWorkflow.update).not.toHaveBeenCalled();
    expect(storage.deleteFile).toHaveBeenCalledWith('/synthetic/staged.docx');
  });
});
