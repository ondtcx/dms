import { OnlyofficeController } from './onlyoffice.controller';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  createReadStream: jest.fn(),
}));

describe('OnlyofficeController.handleCallback', () => {
  it('delegates callback authentication and preserves the safe response shape', async () => {
    const service = {
      handleCallback: jest.fn().mockResolvedValue({ error: 0 }),
    };
    const controller = new OnlyofficeController(
      service as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const response = { json: jest.fn() } as any;

    await controller.handleCallback(
      42,
      { status: 1, key: 'doc_42_save_1' },
      { headers: { authorization: 'Bearer signed-callback' } } as any,
      response,
    );

    expect(service.handleCallback).toHaveBeenCalledWith(
      42,
      { status: 1, key: 'doc_42_save_1' },
      'Bearer signed-callback',
      undefined,
    );
    expect(response.json).toHaveBeenCalledWith({ error: 0 });
  });

  it('forwards the purpose-scoped issuance query to the service guard', async () => {
    const service = {
      handleCallback: jest.fn().mockResolvedValue({ error: 0 }),
    };
    const controller = new OnlyofficeController(
      service as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const response = { json: jest.fn() } as any;

    await controller.handleCallback(
      42,
      { status: 2, key: 'doc_42_save_1' },
      { headers: {} } as any,
      response,
      'issuance-token',
    );

    expect(service.handleCallback).toHaveBeenCalledWith(
      42,
      { status: 2, key: 'doc_42_save_1' },
      undefined,
      'issuance-token',
    );
    expect(response.json).toHaveBeenCalledWith({ error: 0 });
  });

  it('normalizes service results and exceptions to the minimal response', async () => {
    const service = {
      handleCallback: jest
        .fn()
        .mockResolvedValueOnce({ error: 0, token: 'secret' })
        .mockRejectedValueOnce(new Error('internal detail')),
    };
    const controller = new OnlyofficeController(
      service as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const response = { json: jest.fn() } as any;
    await controller.handleCallback(42, {}, { headers: {} }, response);
    await controller.handleCallback(42, {}, { headers: {} }, response);
    expect(response.json).toHaveBeenNthCalledWith(1, { error: 0 });
    expect(response.json).toHaveBeenNthCalledWith(2, { error: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records an UPDATE access event for the user reported by OnlyOffice', async () => {
    const onlyofficeService = {
      handleCallback: jest.fn().mockResolvedValue({ error: 0 }),
    };
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 42,
          currentVersion: 1,
          uploadedById: 'owner-1',
          versions: [
            {
              filename: 'document.docx',
              mimetype:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              storedName: 'document.docx',
              path: '/tmp/document.docx',
            },
          ],
        }),
        update: jest.fn(),
      },
      documentVersion: { create: jest.fn() },
      documentAccess: { create: jest.fn() },
    };
    const storageService = {
      calculateFileHash: jest.fn().mockResolvedValue('new-checksum'),
    };
    const controller = new OnlyofficeController(
      onlyofficeService as never,
      {} as never,
      storageService as never,
      prisma as never,
    );
    const response = { json: jest.fn() } as any;
    jest.spyOn(global, 'fetch').mockResolvedValue({
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    } as Response);
    await controller.handleCallback(
      42,
      {
        status: 2,
        url: 'https://onlyoffice.test/document.docx',
        users: ['editor-1'],
      },
      response,
    );

    expect(onlyofficeService.handleCallback).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 2 }),
      undefined,
      undefined,
    );
    expect(response.json).toHaveBeenCalledWith({ error: 0 });
  });
});

describe('OnlyofficeController.getFile', () => {
  it.each([null, undefined] as any[])(
    'rejects invalid or revoked file access before streaming: %p',
    async (access) => {
      jest.clearAllMocks();
      const service = {
        resolveFileAccess: jest.fn().mockResolvedValue(access),
      };
      const controller = new OnlyofficeController(
        service as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(controller.getFile(42, 'token', {} as any)).rejects.toThrow(
        'Token inválido o expirado',
      );
      expect(service.resolveFileAccess).toHaveBeenCalledWith(42, 'token');
      expect(fs.createReadStream).not.toHaveBeenCalled();
    },
  );

  it('streams the version authorized by the service guard', async () => {
    const stream = {};
    (fs.createReadStream as jest.Mock).mockReturnValue(stream);
    const response = { set: jest.fn() } as any;
    const service = {
      resolveFileAccess: jest.fn().mockResolvedValue({
        version: {
          path: '/safe/file.docx',
          filename: 'file.docx',
          mimetype: 'application/docx',
        },
      }),
    };
    const controller = new OnlyofficeController(
      service as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      controller.getFile(42, 'token', response),
    ).resolves.toBeDefined();
    expect(service.resolveFileAccess).toHaveBeenCalledWith(42, 'token');
    expect(fs.createReadStream).toHaveBeenCalledWith('/safe/file.docx');
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/docx' }),
    );
  });
});
