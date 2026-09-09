import { OnlyofficeController } from './onlyoffice.controller';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

describe('OnlyofficeController.handleCallback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records an UPDATE access event for the user reported by OnlyOffice', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 42,
          currentVersion: 1,
          uploadedById: 'owner-1',
          versions: [{
            filename: 'document.docx',
            mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            storedName: 'document.docx',
            path: '/tmp/document.docx',
          }],
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
      {} as never,
      {} as never,
      storageService as never,
      prisma as never,
      {} as never,
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

    expect(prisma.documentAccess.create).toHaveBeenCalledWith({
      data: { documentId: 42, userId: 'editor-1', action: 'UPDATE' },
    });
    expect(response.json).toHaveBeenCalledWith({ error: 0 });
  });
});
