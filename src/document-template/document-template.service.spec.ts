import { DocumentTemplateService } from './document-template.service';
import { UserRole } from '../auth/role.enum';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  statSync: jest.fn(() => ({ size: 3 })),
}));

jest.mock('./document-generator.service', () => ({
  DocumentGeneratorService: class {},
}));

describe('DocumentTemplateService.updateDocumentFromTemplate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records an UPDATE access event after a successful form edit', async () => {
    const prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({
          id: 42,
          uploadedById: 'editor-1',
          currentVersion: 1,
          templateData: { templateId: 7 },
          versions: [{ filename: 'document.pdf' }],
        }),
        update: jest.fn().mockResolvedValue({ id: 42 }),
      },
      documentTemplate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          name: 'Acta',
          isActive: true,
          fields: { fields: [] },
          outputFormat: 'pdf',
          htmlTemplate: '<p>{{title}}</p>',
          styles: '',
          pageSize: 'A4',
          orientation: 'portrait',
          documentType: { name: 'Acta' },
        }),
      },
      documentVersion: { create: jest.fn() },
      documentAccess: { create: jest.fn() },
    };
    const documentGenerator = {
      generatePDF: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      saveDocumentToFile: jest.fn().mockResolvedValue('/tmp/document.pdf'),
    };
    const thumbnailService = {
      regenerateThumbnail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DocumentTemplateService(
      prisma as never,
      documentGenerator as never,
      {} as never,
      thumbnailService as never,
      {} as never,
    );

    jest.spyOn(service as any, 'getInstitutionMetadata').mockResolvedValue({});
    await service.updateDocumentFromTemplate(
      42,
      { formData: { title: 'Updated' } } as any,
      'editor-1',
      UserRole.USER,
    );

    expect(prisma.documentAccess.create).toHaveBeenCalledWith({
      data: { documentId: 42, userId: 'editor-1', action: 'UPDATE' },
    });
  });
});
