import { BadRequestException } from '@nestjs/common';
import { DocumentTypeService } from './document-type.service';

describe('DocumentTypeService defaults', () => {
  const transaction = {
    documentType: {
      updateMany: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 2, isDefault: true }),
      create: jest.fn(),
    },
  };
  const prisma = {
    category: { findUnique: jest.fn() },
    documentType: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the previous default before setting another one', async () => {
    prisma.documentType.findUnique.mockResolvedValue({
      id: 2,
      name: 'Nuevo',
      categoryId: 1,
      isActive: true,
      isDefault: false,
      _count: { documents: 0, documentTemplates: 0 },
    });

    const service = new DocumentTypeService(prisma as never);
    await service.update(2, { isDefault: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.documentType.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true, id: { not: 2 } },
      data: { isDefault: false },
    });
    expect(transaction.documentType.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: { isDefault: true },
      }),
    );
  });

  it('looks up only an active default', async () => {
    const service = new DocumentTypeService(prisma as never);
    await service.findDefault();

    expect(prisma.documentType.findFirst).toHaveBeenCalledWith({
      where: { isDefault: true, isActive: true },
      include: expect.any(Object),
      orderBy: { id: 'asc' },
    });
  });

  it('rejects a request to make an inactive type the default', async () => {
    prisma.documentType.findUnique.mockResolvedValue({
      id: 2,
      name: 'Inactivo',
      categoryId: 1,
      isActive: false,
      isDefault: false,
      _count: { documents: 0, documentTemplates: 0 },
    });

    const service = new DocumentTypeService(prisma as never);
    await expect(service.update(2, { isDefault: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
