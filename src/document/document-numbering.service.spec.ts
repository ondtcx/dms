import { Test, TestingModule } from '@nestjs/testing';
import { DocumentNumberingService } from './document-numbering.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DocumentNumberingService', () => {
  let service: DocumentNumberingService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentNumberingService,
        {
          provide: PrismaService,
          useValue: {
            document: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            documentCounter: {
              findUnique: jest.fn(),
              deleteMany: jest.fn(),
              create: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentNumberingService>(DocumentNumberingService);
    prisma = module.get(PrismaService);
  });

  it('should preview the next number using fixed prefixes and four digits', async () => {
    prisma.documentCounter.findUnique.mockResolvedValue({ lastNumber: 7 });

    const result = await service.previewNextNumber(
      'Oficio',
      new Date('2026-05-10T00:00:00.000Z'),
    );

    expect(result).toBe('OFI-2026-0008');
    expect(prisma.documentCounter.findUnique).toHaveBeenCalledWith({
      where: {
        sectionPrefix_categoryPrefix_year: {
          sectionPrefix: 'OFI',
          categoryPrefix: 'DOC',
          year: 2026,
        },
      },
      select: { lastNumber: true },
    });
  });

  it('should sync existing documents using document date order and fallback prefixes', async () => {
    prisma.document.findMany.mockResolvedValue([
      {
        id: 1,
        documentNumber: null,
        documentDate: new Date('2026-04-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        documentType: { name: 'Oficio' },
      },
      {
        id: 2,
        documentNumber: 'ANT-0001',
        documentDate: new Date('2026-04-15T00:00:00.000Z'),
        createdAt: new Date('2026-04-15T10:00:00.000Z'),
        documentType: { name: 'Oficio' },
      },
      {
        id: 3,
        documentNumber: null,
        documentDate: null,
        createdAt: new Date('2026-06-20T10:00:00.000Z'),
        documentType: null,
      },
    ]);

    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        documentCounter: prisma.documentCounter,
        document: prisma.document,
      }),
    );

    await service.syncExistingNumbers();

    expect(prisma.documentCounter.deleteMany).toHaveBeenCalledWith({
      where: { categoryPrefix: 'DOC' },
    });
    expect(prisma.documentCounter.create).toHaveBeenCalledTimes(2);
    expect(prisma.document.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { documentNumber: 'OFI-2026-0001' },
    });
    expect(prisma.document.update).toHaveBeenNthCalledWith(2, {
      where: { id: 2 },
      data: { documentNumber: 'OFI-2026-0002' },
    });
    expect(prisma.document.update).toHaveBeenNthCalledWith(3, {
      where: { id: 3 },
      data: { documentNumber: 'DOC-2026-0001' },
    });
  });
});
