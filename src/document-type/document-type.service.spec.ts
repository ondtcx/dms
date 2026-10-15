import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';

describe('DocumentTypeService default document type', () => {
  const documentType = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    category: { findUnique: jest.fn() },
    documentType,
    $transaction: jest.fn(async (operation) => operation({ documentType })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a default type and clears the previous default', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 1,
      name: 'Administrativos',
    });
    documentType.findUnique.mockResolvedValue(null);
    documentType.create.mockResolvedValue({ id: 5, isDefault: true });

    const service = new DocumentTypeService(prisma as never);
    await service.create({
      name: 'Oficio',
      categoryId: 1,
      isDefault: true,
    });

    expect(documentType.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    expect(documentType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Oficio',
          categoryId: 1,
          isActive: true,
          isDefault: true,
        }),
      }),
    );
  });

  it('creates an uncategorized type without looking up a category', async () => {
    documentType.findFirst.mockResolvedValue(null);
    documentType.create.mockResolvedValue({
      id: 22,
      name: 'Documento general',
      categoryId: null,
      isDefault: true,
    });

    const service = new DocumentTypeService(prisma as never);
    await service.create({ name: 'Documento general', isDefault: true });

    expect(prisma.category.findUnique).not.toHaveBeenCalled();
    expect(documentType.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Documento general',
          isDefault: true,
        }),
      }),
    );
  });

  it('rejects an inactive default type', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 1 });
    documentType.findUnique.mockResolvedValue(null);

    const service = new DocumentTypeService(prisma as never);

    await expect(
      service.create({
        name: 'Oficio',
        categoryId: 1,
        isActive: false,
        isDefault: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns only the active default type', async () => {
    documentType.findFirst.mockResolvedValue({ id: 5, isDefault: true });

    const service = new DocumentTypeService(prisma as never);
    await service.findDefault();

    expect(documentType.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDefault: true, isActive: true },
      }),
    );
  });

  it('rejects disabling the current default type', async () => {
    documentType.findUnique.mockResolvedValue({
      id: 5,
      name: 'Oficio',
      categoryId: 1,
      isActive: true,
      isDefault: true,
    });

    const service = new DocumentTypeService(prisma as never);

    await expect(service.update(5, { isActive: false })).rejects.toThrow(
      'El tipo predeterminado no puede desactivarse',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects clearing the current default without choosing another one', async () => {
    documentType.findUnique.mockResolvedValue({
      id: 5,
      name: 'Oficio',
      categoryId: 1,
      isActive: true,
      isDefault: true,
    });

    const service = new DocumentTypeService(prisma as never);

    await expect(service.update(5, { isDefault: false })).rejects.toThrow(
      'Seleccione otro tipo predeterminado antes de quitar el actual',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('DocumentTypeService remove', () => {
  const documentType = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    category: { findUnique: jest.fn() },
    documentType,
    $transaction: jest.fn(async (operation) => operation({ documentType })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes a type whose only dependents are templates', async () => {
    documentType.findUnique
      .mockResolvedValueOnce({ id: 5, name: 'Oficio' })
      .mockResolvedValueOnce({ _count: { documents: 0 } });
    documentType.delete.mockResolvedValue({ id: 5 });

    const service = new DocumentTypeService(prisma as never);

    await expect(service.remove(5)).resolves.toEqual({
      message: 'Tipo de documento eliminado correctamente',
    });
    expect(documentType.findUnique).toHaveBeenLastCalledWith({
      where: { id: 5 },
      select: { _count: { select: { documents: true } } },
    });
    expect(documentType.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('still refuses to delete a type that has documents', async () => {
    documentType.findUnique
      .mockResolvedValueOnce({ id: 5, name: 'Oficio' })
      .mockResolvedValueOnce({ _count: { documents: 2 } });

    const service = new DocumentTypeService(prisma as never);

    await expect(service.remove(5)).rejects.toThrow(
      'No se puede eliminar el tipo porque tiene 2 documento(s) asociados',
    );
    expect(documentType.delete).not.toHaveBeenCalled();
  });
});

describe('CreateDocumentTypeDto default contract', () => {
  it('accepts the isDefault field', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        { name: 'Oficio', categoryId: 1, isDefault: true },
        { type: 'body', metatype: CreateDocumentTypeDto },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ isDefault: true }),
    );
  });
});
