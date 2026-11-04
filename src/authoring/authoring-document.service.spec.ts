import { ForbiddenException } from '@nestjs/common';
import { AuthoringDocumentService } from './authoring-document.service';

describe('AuthoringDocumentService review authority', () => {
  const prisma = {
    document: {
      findFirst: jest.fn(),
    },
  };
  const service = new AuthoringDocumentService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { record: jest.fn() } as any,
  );

  const document = {
    id: 1,
    uploadedBy: 'user-1',
    templateData: {},
    versions: [],
    authoring: {
      id: 10,
      status: 'IN_REVIEW',
      reviewerId: 99,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.document.findFirst.mockResolvedValue(document);
  });

  it('rejects approval from a user who is not the assigned reviewer', async () => {
    await expect(
      service.approve(
        1,
        {},
        { id: 1, name: 'Ana Torres', role: 'rector' } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a return from a user who is not the assigned reviewer', async () => {
    await expect(
      service.returnDocument(
        1,
        { observation: 'Corregir el acta' },
        { id: 1, name: 'Ana Torres', role: 'docente' } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects review from a low-authority user when no reviewer is assigned', async () => {
    prisma.document.findFirst.mockResolvedValue({
      ...document,
      authoring: { ...document.authoring, reviewerId: null },
    });

    await expect(
      service.approve(
        1,
        {},
        { id: 1, name: 'Ana Torres', role: 'docente' } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only allows the creator to emit and number an approved document', async () => {
    prisma.document.findFirst.mockResolvedValue({
      ...document,
      uploadedById: 'owner-1',
      authoring: { ...document.authoring, status: 'APPROVED' },
    });

    await expect(
      service.emit(1, { id: 'reviewer-1', name: 'Revisor', role: 'rector' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthoringDocumentService editor creation', () => {
  const prisma: any = {
    document: { create: jest.fn(), findFirst: jest.fn() },
    documentType: { findUnique: jest.fn(), findFirst: jest.fn() },
    academicYear: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    category: { findFirst: jest.fn() },
    directory: { findFirst: jest.fn(), create: jest.fn() },
    directoryAncestor: { upsert: jest.fn() },
    documentTemplate: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    documentTemplateVersion: { create: jest.fn() },
  };
  const templates = { getVersion: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const version = {
    id: 3,
    templateId: 7,
    status: 'PUBLISHED',
    pageFrame: null,
    fields: { fields: [] },
    template: {
      id: 7,
      name: 'Oficio institucional',
      categoryId: 25,
      documentTypeId: 23,
      isBlank: false,
    },
  };
  let service: AuthoringDocumentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthoringDocumentService(
      prisma,
      templates as any,
      {} as any,
      {} as any,
      {} as any,
      audit as any,
    );
    templates.getVersion.mockResolvedValue(version);
    prisma.documentType.findUnique.mockResolvedValue({
      id: 23,
      isActive: true,
      categoryId: 6,
    });
    prisma.academicYear.findUnique.mockResolvedValue({ id: 9 });
    prisma.document.create.mockResolvedValue({ id: 42, name: 'Mi documento' });
    (service as any).defaultDirectoryId = jest.fn().mockResolvedValue(5);
    (service as any).buildRendered = jest.fn().mockResolvedValue({
      buffer: Buffer.from('pdf'),
      htmlSnapshot: '<p/>',
    });
    (service as any).saveBuffer = jest
      .fn()
      .mockResolvedValue({ storedName: 'x.pdf', filePath: '/tmp/x.pdf' });
    (service as any).createContentVersion = jest.fn().mockResolvedValue({});
    (service as any).findDocument = jest.fn().mockResolvedValue({ id: 42 });
  });

  it('creates a draft with the requested metadata and type', async () => {
    await service.createDraft(
      {
        templateVersionId: 3,
        name: 'Mi documento',
        description: 'Descripción',
        documentTypeId: 23,
        academicYearId: 9,
        originDate: '2026-09-02',
      },
      { id: 'u1', name: 'Ana', role: 'secretario' },
    );

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Mi documento',
          description: 'Descripción',
          documentTypeId: 23,
          categoryId: 6,
          originDate: new Date('2026-09-02T00:00:00.000Z'),
          academic: { create: { academicYearId: 9 } },
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        metadata: expect.objectContaining({
          origin: 'TEMPLATE',
          documentTypeId: 23,
          academicYearId: 9,
        }),
      }),
    );
  });

  it('creates a blank draft through the system template', async () => {
    (service as any).ensureBlankTemplate = jest
      .fn()
      .mockResolvedValue(version);

    await service.createDraft(
      { blank: true, name: 'Documento' },
      { id: 'u1', name: 'Ana', role: 'secretario' },
    );

    expect((service as any).ensureBlankTemplate).toHaveBeenCalledWith(
      {
        id: 'u1',
        name: 'Ana',
        role: 'secretario',
      },
      false,
    );
    expect(templates.getVersion).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ origin: 'EDITOR' }),
      }),
    );
  });

  it('rejects a draft that is both templated and blank', async () => {
    await expect(
      service.createDraft(
        { blank: true, templateVersionId: 3 },
        { id: 'u1' },
      ),
    ).rejects.toThrow('Indica una plantilla o crea un documento en blanco');
  });

  it('requests the institutional blank frame when selected', async () => {
    (service as any).ensureBlankTemplate = jest
      .fn()
      .mockResolvedValue(version);

    await service.createDraft(
      { blank: true, institutionalFrame: true, name: 'Documento' },
      { id: 'u1', name: 'Ana', role: 'secretario' },
    );

    expect((service as any).ensureBlankTemplate).toHaveBeenCalledWith(
      { id: 'u1', name: 'Ana', role: 'secretario' },
      true,
    );
  });

});
