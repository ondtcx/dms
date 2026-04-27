import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from './document.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentNumberingService } from './document-numbering.service';
import { UploadDocumentDto } from './dto/upload-document.dto';


jest.mock('uuid', () => ({ v4: () => '1234-5678' }));

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
            user: {
              findUnique: jest
                .fn()
                .mockResolvedValue({ role: { id: 'role-admin', name: 'admin' } }),
            },
          },
        },
        {
          provide: StorageService,
          useValue: {
            generateStructuredPath: jest.fn().mockReturnValue({ path: '/tmp/structured/test.pdf' }),
            moveFile: jest.fn(),
            calculateFileHash: jest.fn().mockResolvedValue('hash123'),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getSetting: jest.fn().mockResolvedValue({}),
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

    it('should allow upload when user roleId is mapped in categoryRoles', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1000,
        path: '/tmp/test.pdf',
      };

      jest.spyOn(prisma.category, 'findUnique').mockResolvedValue({
        requiresCourse: false,
        categoryRoles: [{ roleId: 'role-teacher' }],
      } as any);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        role: { id: 'role-teacher', name: 'teacher' },
      } as any);

      await expect(
        service.upload(file, { description: 'Test', categoryId: 1 } as UploadDocumentDto, 'user123'),
      ).resolves.toBeDefined();
    });

    it('should deny upload when user roleId is not mapped in categoryRoles', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1000,
        path: '/tmp/test.pdf',
      };

      jest.spyOn(prisma.category, 'findUnique').mockResolvedValue({
        requiresCourse: false,
        categoryRoles: [{ roleId: 'role-coordinator' }],
      } as any);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        role: { id: 'role-teacher', name: 'teacher' },
      } as any);

      await expect(
        service.upload(file, { description: 'Test', categoryId: 1 } as UploadDocumentDto, 'user123'),
      ).rejects.toThrow('Tu rol no tiene permiso para subir documentos a esta categoría');
    });
  });

  describe('findAll', () => {
    it('should include nested 1:1 relations in the query', async () => {
      jest.spyOn(prisma.document, 'findMany').mockResolvedValue([{ id: 1 } as any]);
      
      await service.findAll({ page: 1, limit: 10 } as any, 'user123', 'admin');

      expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({
          academic: true,
          search: true,
          templateData: expect.any(Object),
          versions: expect.any(Object),
        }),
      }));
    });

    it('should apply subtype, status, modality and date range filters', async () => {
      jest.spyOn(prisma.document, 'findMany').mockResolvedValue([{ id: 1 } as any]);

      await service.findAll(
        {
          page: 1,
          limit: 10,
          documentTypeId: 4,
          status: 'REGISTRADO',
          modality: 'PHYSICAL',
          dateFrom: '2026-01-01',
          dateTo: '2026-12-31',
        } as any,
        'user123',
        'admin',
      );

      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { documentTypeId: 4 },
              { status: 'REGISTRADO' },
              { currentVersion: 0 },
              {
                documentDate: expect.objectContaining({
                  gte: new Date('2026-01-01'),
                  lte: expect.any(Date),
                }),
              },
            ]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should include nested 1:1 relations when fetching a specific document', async () => {
      jest.spyOn(prisma.document, 'findFirst').mockResolvedValue({ id: 1, versions: [{}] } as any);
      
      await service.findOne(1, 'user123', 'admin');

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

      await service.update(1, dto as any, 'user123', 'admin');

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
});
