import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { OnlyofficeService } from './onlyoffice.service';
import { CreateBlankDocumentDto } from './dto/create-blank-document.dto';

jest.mock('fs');

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

describe('OnlyofficeService.createBlankDocument', () => {
  let service: OnlyofficeService;
  let storage: {
    generateStructuredPath: jest.Mock;
    moveFile: jest.Mock;
    calculateFileHash: jest.Mock;
  };
  let prisma: {
    academicYear: { findFirst: jest.Mock };
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
      document: { create: jest.fn(async () => ({ id: 42 })) },
    };
    thumbnailService = { regenerateThumbnail: jest.fn(async () => undefined) };
    service = new OnlyofficeService(
      {} as ConfigService,
      storage as never,
      prisma as never,
      thumbnailService as never,
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
          new RegExp(`^uploads\\/temp\\/[0-9a-f-]{36}\\${extension}$`),
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
          new RegExp(`^uploads\\/temp\\/[0-9a-f-]{36}\\${extension}$`),
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
});
