import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from './document.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentNumberingService } from './document-numbering.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UserRole } from '../auth/role.enum';
import * as fs from 'fs';

jest.mock('uuid', () => ({ v4: () => '1234-5678' }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

describe('DocumentService', () => {
  let service: DocumentService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: PrismaService,
          useValue: {
            category: { findUnique: jest.fn() },
            academicYear: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
            document: { 
              create: jest.fn().mockResolvedValue({ id: 1 }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 1, versions: [{}] }),
              findFirst: jest.fn().mockResolvedValue({ id: 1, versions: [{}] }),
              update: jest.fn().mockResolvedValue({ id: 1 }),
              count: jest.fn().mockResolvedValue(0),
            },
            documentVersion: {
              create: jest.fn(),
              count: jest.fn().mockResolvedValue(1),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { size: 0 } }),
            },
            documentAccess: { create: jest.fn() },
            workflowApproval: { findFirst: jest.fn().mockResolvedValue(null) },
            user: { findUnique: jest.fn().mockResolvedValue({ role: 'admin' }) },
          },
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

  describe('upload', () => {
    it('should create document with nested academic and template data', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1000,
        path: '/tmp/test.pdf',
      };

      const dto: UploadDocumentDto = {
        description: 'Test',
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
  });

  describe('update', () => {
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
          { workflow: { is: { status: 'DRAFT' } } },
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
          { workflow: { is: { status: 'DRAFT' } } },
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
