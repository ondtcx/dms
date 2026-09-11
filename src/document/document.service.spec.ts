import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentService } from './document.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentNumberingService } from './document-numbering.service';
import { DirectoryService } from '../directory/directory.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UserRole } from '../auth/role.enum';
import * as fs from 'fs';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn(),
}));
import { PDFParse } from 'pdf-parse';

jest.mock('uuid', () => ({ v4: () => '1234-5678' }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFile: jest.fn(),
}));

describe('DocumentService', () => {
  let service: DocumentService;
  let prisma: PrismaService;

  const pdfParseMock = PDFParse as unknown as jest.Mock;
  beforeEach(async () => {
    pdfParseMock.mockReset();
    pdfParseMock.mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: '' }),
      destroy: jest.fn(),
    }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: PrismaService,
          useValue: {
            category: {
              upsert: jest.fn().mockResolvedValue({
                id: 99,
                allowedRoles: [],
                requiresCourse: false,
              }),
              findUnique: jest.fn().mockResolvedValue({
                id: 99,
                allowedRoles: [],
                requiresCourse: false,
              }),
            },
            documentType: {
              findUnique: jest.fn().mockResolvedValue({ id: 12, isActive: true, categoryId: 99 }),
              findFirst: jest.fn().mockResolvedValue({ id: 12, isActive: true, categoryId: 99 }),
            },
            academicYear: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
            document: { 
              create: jest.fn().mockResolvedValue({ id: 1 }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 1, versions: [{}] }),
              findFirst: jest.fn().mockResolvedValue({ id: 1, versions: [{}] }),
              update: jest.fn().mockResolvedValue({ id: 1 }),
              count: jest.fn().mockResolvedValue(0),
              delete: jest.fn().mockResolvedValue({ id: 1 }),
            },
            directory: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
            documentVersion: {
              create: jest.fn(),
              count: jest.fn().mockResolvedValue(1),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { size: 0 } }),
            },
            documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
            documentAccess: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
            user: { findUnique: jest.fn().mockResolvedValue({ role: 'admin' }) },
          },
        },
        {
          provide: DirectoryService,
          useValue: { assertDiscoverable: jest.fn().mockResolvedValue({ id: 7 }) },
        },
        {
          provide: StorageService,
          useValue: {
            generateStructuredPath: jest.fn().mockReturnValue({ path: '/tmp/structured/test.pdf' }),
            moveFile: jest.fn(),
            deleteFile: jest.fn(),
            fileExists: jest.fn().mockReturnValue(true),
            calculateFileHash: jest.fn().mockResolvedValue('hash123'),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getSetting: jest.fn().mockResolvedValue({}),
            getMaxVersionsPerDocument: jest.fn().mockResolvedValue(3),
          },
        },
        {
          provide: ThumbnailService,
          useValue: {
            generateThumbnail: jest.fn(),
            regenerateThumbnail: jest.fn().mockResolvedValue(true),
            deleteThumbnail: jest.fn(),
          },
        },
        {
          provide: DocumentNumberingService,
          useValue: {
            generateNumber: jest.fn().mockResolvedValue('DOC-001'),
            assignNumber: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('extractTextFromPDF', () => {
    beforeEach(() => {
      (fs.readFile as unknown as jest.Mock).mockImplementation(((_path: any, callback: any) => {
        callback(null, Buffer.from('pdf-data'));
      }) as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('constructs PDFParse with Uint8Array data and returns extracted text', async () => {
      const parser = { getText: jest.fn().mockResolvedValue({ text: 'Extracted text' }), destroy: jest.fn() };
      pdfParseMock.mockImplementation(() => parser);

      const result = await (service as any).extractTextFromPDF('/tmp/test.pdf');

      expect(result).toBe('Extracted text');
      expect(pdfParseMock).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
      expect(pdfParseMock.mock.calls[0][0].data).toEqual(new Uint8Array(Buffer.from('pdf-data')));
      expect(parser.getText).toHaveBeenCalledTimes(1);
      expect(parser.destroy).toHaveBeenCalledTimes(1);
    });

    it('preserves successful empty text and destroys the parser once', async () => {
      const parser = { getText: jest.fn().mockResolvedValue({ text: '' }), destroy: jest.fn() };
      pdfParseMock.mockImplementation(() => parser);

      await expect((service as any).extractTextFromPDF('/tmp/test.pdf')).resolves.toBe('');
      expect(parser.destroy).toHaveBeenCalledTimes(1);
    });

    it('returns null and logs when parser construction fails', async () => {
      const error = new Error('construction failed');
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      pdfParseMock.mockImplementation(() => { throw error; });

      await expect((service as any).extractTextFromPDF('/tmp/test.pdf')).resolves.toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'Error extrayendo texto del PDF /tmp/test.pdf:',
        error,
      );
    });

    it('returns null and logs when reading the PDF fails', async () => {
      const error = new Error('read failed');
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (fs.readFile as unknown as jest.Mock).mockImplementation(((_path: any, callback: any) => {
        callback(error);
      }) as any);

      await expect((service as any).extractTextFromPDF('/tmp/test.pdf')).resolves.toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        'Error extrayendo texto del PDF /tmp/test.pdf:',
        error,
      );
    });

    it('returns null, logs, and destroys once when extraction fails', async () => {
      const error = new Error('extraction failed');
      const parser = { getText: jest.fn().mockRejectedValue(error), destroy: jest.fn() };
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      pdfParseMock.mockImplementation(() => parser);

      await expect((service as any).extractTextFromPDF('/tmp/test.pdf')).resolves.toBeNull();
      expect(parser.destroy).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        'Error extrayendo texto del PDF /tmp/test.pdf:',
        error,
      );
    });

    it('returns null and logs when cleanup fails', async () => {
      const error = new Error('cleanup failed');
      const parser = { getText: jest.fn().mockResolvedValue({ text: 'text' }), destroy: jest.fn().mockRejectedValue(error) };
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      pdfParseMock.mockImplementation(() => parser);

      await expect((service as any).extractTextFromPDF('/tmp/test.pdf')).resolves.toBeNull();
      expect(parser.destroy).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        'Error extrayendo texto del PDF /tmp/test.pdf:',
        error,
      );
    });
  });

  describe('upload', () => {
    const uploadFile = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      size: 1000,
      path: '/tmp/test.txt',
    } as any;

    it('uses the active default document type when no type is provided', async () => {
      await service.upload(uploadFile, {}, 'user123');

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data;
      expect(createData.categoryId).toBe(99);
      expect(createData.documentTypeId).toBe(12);
      expect(prisma.documentType.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, isActive: true },
        select: { id: true, isActive: true, categoryId: true },
        orderBy: { id: 'asc' },
      });
      expect(prisma.documentType.findUnique).not.toHaveBeenCalled();
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 99 },
        select: { id: true, allowedRoles: true, requiresCourse: true },
      });
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect((service as any).storage.generateStructuredPath).toHaveBeenCalledWith(
        'user123',
        99,
        expect.any(String),
      );
      expect((service as any).numberingService.assignNumber).toHaveBeenCalledWith(1, 99);
    });

    it('rejects the upload when no active default document type is configured', async () => {
      (prisma.documentType.findFirst as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.upload(uploadFile, {}, 'user123'))
        .rejects.toThrow('No hay un tipo de documento predeterminado activo configurado');
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('uses the explicit active document type and its category', async () => {
      await service.upload(uploadFile, {
        documentTypeId: 12,
        categoryId: 99,
      }, 'user123');

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data;
      expect(createData.categoryId).toBe(99);
      expect(createData.documentTypeId).toBe(12);
      expect(prisma.documentType.findUnique).toHaveBeenCalledWith({
        where: { id: 12 },
        select: { id: true, isActive: true, categoryId: true },
      });
      expect(prisma.documentType.findFirst).not.toHaveBeenCalled();
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 99 },
        select: { id: true, allowedRoles: true, requiresCourse: true },
      });
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect((service as any).storage.generateStructuredPath).toHaveBeenCalledWith(
        'user123',
        99,
        expect.any(String),
      );
      expect((service as any).numberingService.assignNumber).toHaveBeenCalledWith(1, 99);
    });

    it('rejects an inconsistent explicit category before moving the staged file', async () => {
      await expect(service.upload(uploadFile, {
        documentTypeId: 12,
        categoryId: 404,
      }, 'user123')).rejects.toThrow(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown document type before moving the staged file', async () => {
      (prisma.documentType.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.upload(uploadFile, { documentTypeId: 404 }, 'user123'))
        .rejects.toThrow('El tipo de documento no existe');
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive document type before moving the staged file', async () => {
      (prisma.documentType.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 12,
        isActive: false,
      });

      await expect(service.upload(uploadFile, { documentTypeId: 12 }, 'user123'))
        .rejects.toThrow('El tipo de documento está inactivo');
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(prisma.category.upsert).not.toHaveBeenCalled();
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('should create document with nested academic and template data', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1000,
        path: '/tmp/test.pdf',
      };

      const dto: UploadDocumentDto = {
        description: 'Test',
        documentTypeId: 12,
        academic: {
          courseId: 1,
          subjectId: 2,
          academicYearId: 3,
        },
        templateData: {
          templateId: 5,
        }
      };

      await service.upload(file, dto, 'user123');

      expect(prisma.document.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          academic: {
            create: {
              courseId: 1,
              subjectId: 2,
              academicYearId: 3,
            }
          },
          templateData: {
            create: {
              templateId: 5,
            }
          },
          versions: {
            create: expect.arrayContaining([
              expect.objectContaining({
                filename: 'test.pdf',
                mimetype: 'application/pdf',
                size: 1000,
                path: '/tmp/structured/test.pdf',
                checksumSHA256: 'hash123',
              })
            ])
          }
        })
      }));
    });

    it('continues PDF upload without extracted text when extraction fails', async () => {
      jest.spyOn(service as any, 'extractTextFromPDF').mockResolvedValue(null);

      await service.upload({ originalname: 'failed.pdf', mimetype: 'application/pdf', size: 1, path: '/tmp/failed.pdf' } as any,
        { documentTypeId: 12 } as UploadDocumentDto, 'user123');

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data;
      expect(createData.search).toBeUndefined();
      expect(prisma.document.create).toHaveBeenCalled();
    });

    it('passes successful PDF extraction into upload persistence', async () => {
      jest.spyOn(service as any, 'extractTextFromPDF').mockResolvedValue('indexed text');

      await service.upload({ originalname: 'success.pdf', mimetype: 'application/pdf', size: 1, path: '/tmp/success.pdf' } as any,
        { documentTypeId: 12 } as UploadDocumentDto, 'user123');

      const createData = (prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data;
      expect(createData.search).toEqual({ create: { extractedText: 'indexed text' } });
    });

    it('assigns uploads to a discoverable logical directory', async () => {
      await service.upload({ originalname: 'test.txt', mimetype: 'text/plain', size: 4, path: '/tmp/test.txt' } as any,
        { directoryId: 7, documentTypeId: 12 } as UploadDocumentDto, 'user123');

      expect((prisma.document.create as jest.Mock).mock.calls.at(-1)[0].data.directoryId).toBe(7);
    });

    it('rejects an unavailable upload destination before moving the staged file', async () => {
      (service as any).directoryService.assertDiscoverable.mockRejectedValue(new Error('hidden'));

      await expect(service.upload({ path: '/tmp/test.txt', originalname: 'test.txt', size: 1, mimetype: 'text/plain' } as any,
        { directoryId: 9, documentTypeId: 12 } as UploadDocumentDto, 'user123')).rejects.toThrow('hidden');
      expect((service as any).storage.moveFile).not.toHaveBeenCalled();
    });

    it('removes the finalized file when document persistence fails', async () => {
      (prisma.document.create as jest.Mock).mockRejectedValueOnce(new Error('database unavailable'));

      await expect(service.upload({ path: '/tmp/test.txt', originalname: 'test.txt', size: 1, mimetype: 'text/plain' } as any,
        { documentTypeId: 12 } as UploadDocumentDto, 'user123')).rejects.toThrow('database unavailable');
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/test.pdf');
    });

    it('removes the finalized file when hash preparation fails', async () => {
      (service as any).storage.calculateFileHash.mockRejectedValueOnce(new Error('hash unavailable'));

      await expect(service.upload({ path: '/tmp/test.txt', originalname: 'test.txt', size: 1, mimetype: 'text/plain' } as any,
        { documentTypeId: 12 } as UploadDocumentDto, 'user123')).rejects.toThrow('hash unavailable');
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/test.pdf');
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('compensates persisted documents and finalized files when a later upload fails', async () => {
      const upload = jest.spyOn(service, 'upload')
        .mockResolvedValueOnce({
          id: 1,
          versions: [{ path: '/tmp/structured/first.txt' }],
        } as any)
        .mockRejectedValueOnce(new Error('second upload failed'));

      await expect(service.uploadMultiple(
        [{ path: '/tmp/first.txt' }, { path: '/tmp/second.txt' }] as any,
        { documentTypeId: 12 } as UploadDocumentDto,
        'user123',
      )).rejects.toThrow('second upload failed');

      expect(upload).toHaveBeenCalledTimes(2);
      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect((service as any).storage.deleteFile).toHaveBeenCalledWith('/tmp/structured/first.txt');
    });
  });

  describe('findAll', () => {
    it('should include nested 1:1 relations in the query', async () => {
      jest.spyOn(prisma.document, 'findMany').mockResolvedValue([{ id: 1 } as any]);
      
      await service.findAll({ page: 1, limit: 10 } as any, 'user123', UserRole.ADMIN);

      expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          academic: true,
          search: true,
          templateData: expect.any(Object),
          versions: expect.any(Object),
        }),
      }));
    });

    it('filters root and directory listings without bypassing access predicates', async () => {
      await service.findAll({ page: 1, limit: 10, directoryId: 7 } as any, 'user123', UserRole.ADMIN);
      expect((prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].where.AND)
        .toEqual(expect.arrayContaining([{ directoryId: 7 }]));
    });

    it('keeps viewer access predicates when filtering the logical root', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });

      await service.findAll({ page: 1, limit: 10, directoryId: null } as any, 'viewer', UserRole.USER);

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].where;
      expect(where.AND).toEqual(expect.arrayContaining([
        { directoryId: null },
        expect.objectContaining({ OR: expect.arrayContaining([
          { uploadedById: 'viewer' },
          { isPublic: true },
        ]) }),
      ]));
    });

    it('orders recent accessed documents by the current user activity types', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });
      (prisma.documentAccess.findMany as jest.Mock).mockResolvedValue([
        { documentId: 2 },
        { documentId: 1 },
        { documentId: 2 },
      ]);
      (prisma.document.findMany as jest.Mock).mockResolvedValue([{ id: 1 }, { id: 2 }]);
      (prisma.document.count as jest.Mock).mockResolvedValue(2);

      const result = await service.findAll(
        { view: 'recent-accessed', page: 1, limit: 10 } as any,
        'viewer',
        UserRole.USER,
      );

      expect(result.data.map((document) => document.id)).toEqual([2, 1]);
      expect(prisma.documentAccess.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: 'viewer',
          action: { in: ['VIEW', 'DOWNLOAD', 'UPDATE'] },
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        distinct: ['documentId'],
      }));
    });

    it('scopes all documents while omitting automatic academic, batch, and composite filters', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });

      await service.findAll({
        view: 'all',
        academicYearId: 3,
        excludeBatched: true,
        excludeComposites: true,
        page: 1,
        limit: 10,
      } as any, 'viewer', UserRole.USER);

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].where;
      expect(where.AND).toEqual(expect.arrayContaining([{ deletedAt: null }]));
      expect(where.AND).not.toEqual(expect.arrayContaining([
        { OR: [{ templateData: null }, { templateData: { batchId: null } }] },
        { isComposite: false },
      ]));
      expect(where.AND.some((condition: any) => condition.academic)).toBe(false);
      expect(where.AND).toEqual(expect.arrayContaining([
        expect.objectContaining({ OR: expect.arrayContaining([{ uploadedById: 'viewer' }, { isPublic: true }]) }),
      ]));
    });

    it('keeps deleted documents out of all view even when includeDeleted is requested', async () => {
      await service.findAll({
        view: 'all',
        includeDeleted: true,
        page: 1,
        limit: 10,
      } as any, 'user123', UserRole.ADMIN);

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].where;
      expect(where.AND).toEqual(expect.arrayContaining([{ deletedAt: null }]));
    });

    it('keeps trash restricted to deleted documents when includeDeleted is requested', async () => {
      await service.findAll({
        view: 'trash',
        includeDeleted: true,
        page: 1,
        limit: 10,
      } as any, 'user123', UserRole.ADMIN);

      const where = (prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].where;
      expect(where.AND).toEqual(expect.arrayContaining([{ deletedAt: { not: null } }]));
    });

    it('orders recently created documents by creation time', async () => {
      await service.findAll({ view: 'recent-created', page: 1, limit: 10 } as any, 'user123', UserRole.ADMIN);

      expect((prisma.document.findMany as jest.Mock).mock.calls.at(-1)[0].orderBy)
        .toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });
  });

  describe('move', () => {
    it('rejects a non-numeric destination before looking up the document', async () => {
      await expect(service.move(1, { directoryId: Number.NaN }, 'user123', UserRole.USER))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
    it('changes only logical placement for an editable document', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uploadedById: 'user123', directoryId: null } as any);
      (prisma.document.update as jest.Mock).mockResolvedValue({ id: 1, directoryId: 7 });

      await service.move(1, { directoryId: 7 }, 'user123', UserRole.USER);

      expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { directoryId: 7 } });
    });

    it('does not mutate an inaccessible document', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException('Documento no encontrado'));
      await expect(service.move(1, { directoryId: 7 }, 'user123', UserRole.USER)).rejects.toThrow('Documento no encontrado');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('keeps a moved document available to an authorized viewer and preserves its file path', async () => {
      const movedDocument = {
        id: 1,
        uploadedById: 'owner',
        isPublic: true,
        directoryId: 7,
        versions: [{ path: '/files/active/original.pdf' }],
      };
      (prisma.document.findFirst as jest.Mock).mockResolvedValue(movedDocument);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'viewer',
        role: UserRole.USER,
        roleAssignments: [],
      });
      (prisma.document.update as jest.Mock).mockResolvedValue({ id: 1, directoryId: 7 });

      await service.move(1, { directoryId: 7 }, 'owner', UserRole.USER);
      const visibleDocument = await service.findOne(1, 'viewer', UserRole.USER);

      expect(visibleDocument.versions[0].path).toBe('/files/active/original.pdf');
      expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { directoryId: 7 } });
      expect((prisma.document.findFirst as jest.Mock).mock.calls.at(-1)[0].where).toEqual(expect.objectContaining({
        id: 1,
        OR: expect.arrayContaining([{ isPublic: true }]),
      }));
    });
  });

  describe('findOne', () => {
    it('should include nested 1:1 relations when fetching a specific document', async () => {
      jest.spyOn(prisma.document, 'findFirst').mockResolvedValue({ id: 1, versions: [{}] } as any);
      
      await service.findOne(1, 'user123', UserRole.ADMIN);

      expect(prisma.document.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          academic: true,
          search: true,
          templateData: expect.any(Object),
          versions: expect.any(Object),
        }),
      }));
    });

    it('records a VIEW when a document is opened through the detail route', async () => {
      await service.findOne(1, 'user123', UserRole.ADMIN, true);

      expect(prisma.documentAccess.create).toHaveBeenCalledWith({
        data: { documentId: 1, userId: 'user123', action: 'VIEW' },
      });
    });
  });

  describe('view', () => {
    it('records preview activity as VIEW instead of DOWNLOAD', async () => {
      await service.view(1, 'user123', UserRole.ADMIN);

      expect(prisma.documentAccess.create).toHaveBeenCalledWith({
        data: { documentId: 1, userId: 'user123', action: 'VIEW' },
      });
    });
  });

  describe('update', () => {
    it('blocks metadata edits while an active workflow is in progress', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
      } as any);
      (prisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
        id: 9,
        status: 'IN_PROGRESS',
      });

      await expect(service.update(1, { description: 'Blocked' } as any, 'user123', UserRole.USER))
        .rejects.toThrow('No se puede editar un documento con un workflow activo');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });

    it('allows the initiator to edit after changes are requested', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: 1,
        uploadedById: 'user123',
        versions: [{}],
        academic: { id: 1 },
      } as any);
      (prisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
        id: 9,
        status: 'CHANGES_REQUESTED',
        initiatedById: 'user123',
      });

      await service.update(1, { description: 'Corrected' } as any, 'user123', UserRole.USER);

      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ description: 'Corrected' }),
      }));
    });

    it('should properly structure the update payload for nested relations', async () => {
      jest.spyOn(prisma.document, 'findUnique').mockResolvedValue({ 
        id: 1, 
        versions: [{}],
        academic: { id: 1 },
      } as any);

      const dto = {
        description: 'Updated',
        academic: { courseId: 10 },
      };

      await service.update(1, dto as any, 'user123', UserRole.ADMIN);

      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          description: 'Updated',
          academic: {
            upsert: {
              create: expect.objectContaining({ courseId: 10 }),
              update: expect.objectContaining({ courseId: 10 })
            }
          }
        }),
      }));
    });
  });

  describe('workflow editing integration', () => {
    it('blocks text edits while an active workflow is in progress', async () => {
      const document = {
        id: 1,
        uploadedById: 'user123',
        currentVersion: 1,
        versions: [{ mimetype: 'text/plain', path: '/uploads/document.txt' }],
      };
      jest.spyOn(service, 'findOne').mockResolvedValue(document as any);
      (prisma.documentWorkflow.findFirst as jest.Mock).mockResolvedValue({
        id: 9,
        status: 'PENDING',
      });

      await expect(service.saveTextContent(1, 'Blocked', 'user123', UserRole.USER))
        .rejects.toThrow('No se puede editar un documento con un workflow activo');
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
  });

  describe('saveTextContent', () => {
    const document = {
      id: 1,
      uploadedById: 'user123',
      categoryId: 2,
      currentVersion: 4,
      checksumSHA256: 'old-checksum',
      createdAt: new Date('2026-01-01'),
      versions: [{
        id: 10,
        filename: 'notes.txt',
        mimetype: 'text/plain',
        storedName: 'stored-notes.txt',
        path: '/uploads/stored-notes.txt',
        size: 3,
        checksumSHA256: 'old-checksum',
      }],
    };

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(document as any);
      (fs.writeFileSync as jest.Mock).mockClear();
      (prisma.document.update as jest.Mock).mockResolvedValue({
        ...document,
        currentVersion: 5,
        checksumSHA256: 'new-checksum',
      });
      (prisma.documentVersion.count as jest.Mock).mockResolvedValue(1);
      (prisma.documentVersion.create as jest.Mock).mockResolvedValue({ id: 11 });
      (prisma.documentAccess.create as jest.Mock).mockResolvedValue({ id: 12 });
      (service as any).storage.calculateFileHash.mockResolvedValue('new-checksum');
    });

    it('saves editable text, versions it, audits it, and regenerates its thumbnail', async () => {
      const content = 'Updated text';

      await service.saveTextContent(1, content, 'user123', UserRole.USER);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/uploads/stored-notes.txt',
        Buffer.from(content, 'utf-8'),
      );
      expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 1 },
        data: { currentVersion: 5, checksumSHA256: 'new-checksum' },
      }));
      expect(prisma.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 1,
          version: 5,
          filename: 'notes.txt',
          mimetype: 'text/plain',
          storedName: 'stored-notes.txt',
          path: '/uploads/stored-notes.txt',
          size: Buffer.byteLength(content, 'utf-8'),
          checksumSHA256: 'new-checksum',
          comment: 'Editado con editor básico',
          createdById: 'user123',
          source: 'REEMPLAZO_MANUAL',
        }),
      });
      expect(prisma.documentAccess.create).toHaveBeenCalledWith({
        data: { documentId: 1, userId: 'user123', action: 'UPDATE' },
      });
      expect((service as any).thumbnailService.regenerateThumbnail).toHaveBeenCalledWith(
        '/uploads/stored-notes.txt', 1, 'text/plain',
      );
    });

    it.each([
      'application/json',
      'application/xml',
      'application/javascript',
      'application/csv',
    ])('accepts editable MIME type %s', async (mimetype) => {
      (service as any).findOne.mockResolvedValue({
        ...document,
        versions: [{ ...document.versions[0], mimetype }],
      });

      await expect(service.saveTextContent(1, '{}', 'user123', UserRole.USER))
        .resolves.toEqual(expect.objectContaining({ currentVersion: 5 }));
    });

    it('rejects unsupported MIME types without mutating the document', async () => {
      (service as any).findOne.mockResolvedValue({
        ...document,
        versions: [{ ...document.versions[0], mimetype: 'application/pdf' }],
      });

      await expect(service.saveTextContent(1, 'not editable', 'user123', UserRole.USER))
        .rejects.toThrow('Este tipo de archivo no se puede editar con el editor básico');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
    });

    it('denies users without replacement permission without changing state', async () => {
      (service as any).findOne.mockResolvedValue({ ...document, uploadedById: 'owner-id' });

      await expect(service.saveTextContent(1, 'forbidden', 'user123', UserRole.USER))
        .rejects.toThrow('No tienes permiso para editar este documento');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentVersion.create).not.toHaveBeenCalled();
      expect(prisma.documentAccess.create).not.toHaveBeenCalled();
    });

    it('applies the configured rolling version window without deleting the active file', async () => {
      (service as any).settingsService.getMaxVersionsPerDocument.mockResolvedValue(1);
      (prisma.documentVersion.count as jest.Mock).mockResolvedValue(2);
      (prisma.documentVersion.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 10, path: '/uploads/stored-notes.txt' }])
        .mockResolvedValueOnce([{ path: '/uploads/stored-notes.txt' }]);

      await service.saveTextContent(1, 'new content', 'user123', UserRole.USER);

      expect(prisma.documentVersion.delete).toHaveBeenCalledWith({ where: { id: 10 } });
      expect((service as any).storage.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('non-admin: scopes document count and size sum to the user', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(36);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: 1_048_576 },
      });

      await service.getStats('user123', UserRole.USER);

      expect(prisma.document.count).toHaveBeenCalledWith({
        where: { deletedAt: null, uploadedById: 'user123' },
      });
      expect(prisma.documentVersion.aggregate).toHaveBeenCalledWith({
        where: {
          document: { deletedAt: null, uploadedById: 'user123' },
        },
        _sum: { size: true },
      });
    });

    it('returns total size and formatted MB for a known byte sum', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(36);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: 1_048_576 },
      });

      const stats = await service.getStats('user123', UserRole.USER);

      expect(stats).toEqual({
        totalDocuments: 36,
        totalSize: 1_048_576,
        totalSizeMB: '1.00',
      });
    });

    it('admin: omits uploadedById from both scopes', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(10);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: 512 },
      });

      await service.getStats('admin1', UserRole.ADMIN);

      expect(prisma.document.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
      expect(prisma.documentVersion.aggregate).toHaveBeenCalledWith({
        where: { document: { deletedAt: null } },
        _sum: { size: true },
      });
    });

    it('handles a null size sum as 0 bytes', async () => {
      (prisma.document.count as jest.Mock).mockResolvedValue(0);
      (prisma.documentVersion.aggregate as jest.Mock).mockResolvedValue({
        _sum: { size: null },
      });

      const stats = await service.getStats('user123', UserRole.USER);

      expect(stats).toEqual({
        totalDocuments: 0,
        totalSize: 0,
        totalSizeMB: '0.00',
      });
    });
  });

  describe('getDashboardSummary', () => {
    it('uses one active ReBAC DRAFT predicate for count and pending rows', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user123',
        role: UserRole.USER,
      });
      (prisma.document.count as jest.Mock).mockResolvedValue(6);
      (prisma.document.findMany as jest.Mock)
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockResolvedValueOnce([{ id: 3 }]);

      const summary = await service.getDashboardSummary('user123', UserRole.USER);

      const countWhere = (prisma.document.count as jest.Mock).mock.calls[0][0].where;
      const pendingWhere = (prisma.document.findMany as jest.Mock).mock.calls[0][0].where;

      expect(pendingWhere).toEqual(expect.objectContaining({
        AND: expect.arrayContaining([
          { deletedAt: null },
          { archivedAt: null },
          { workflow: { some: { active: true, status: 'DRAFT' } } },
          expect.objectContaining({ OR: expect.any(Array) }),
        ]),
      }));
      expect(countWhere).toEqual(pendingWhere);
      expect(summary).toEqual(expect.objectContaining({
        pendingOfficializationCount: 6,
        pendingOfficialization: [{ id: 1 }, { id: 2 }],
        pendingHasMore: false,
        recent: [{ id: 3 }],
        recentHasMore: false,
        generatedAt: expect.any(String),
      }));
    });

    it('keeps privileged roles ReBAC-visible while excluding archived and deleted rows', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'rector1',
        role: UserRole.RECTOR,
      });

      await service.getDashboardSummary('rector1', UserRole.RECTOR);

      const pendingWhere = (prisma.document.findMany as jest.Mock).mock.calls[0][0].where;
      expect(pendingWhere).toEqual({
        AND: [
          { deletedAt: null },
          { archivedAt: null },
          { workflow: { some: { active: true, status: 'DRAFT' } } },
        ],
      });
    });

    it('fetches six rows to expose hasMore and orders both lists by updatedAt then id', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user123',
        role: UserRole.USER,
      });
      await service.getDashboardSummary('user123', UserRole.USER);

      for (const call of (prisma.document.findMany as jest.Mock).mock.calls) {
        expect(call[0]).toEqual(expect.objectContaining({
          take: 6,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: expect.objectContaining({
            documentNumber: true,
            versions: expect.any(Object),
            uploadedBy: expect.any(Object),
            category: expect.any(Object),
            workflow: expect.any(Object),
          }),
        }));
      }
    });

    it('rejects limits outside the fixed five-row contract', async () => {
      await expect(
        service.getDashboardSummary('user123', UserRole.USER, 6),
      ).rejects.toThrow('El límite del resumen debe estar entre 1 y 5');
    });
  });
});
