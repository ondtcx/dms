import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';

const DOCUMENT_TYPE_INCLUDE = {
  category: {
    select: { id: true, name: true, color: true, icon: true },
  },
  _count: {
    select: { documents: true },
  },
} as const;

@Injectable()
export class DocumentTypeService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDocumentTypeDto) {
    let category = null;
    if (dto.categoryId != null) {
      category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Categoría con ID ${dto.categoryId} no encontrada`,
        );
      }
    }

    const existing = await this.prisma.documentType.findFirst({
      where: { name: dto.name, categoryId: dto.categoryId ?? null },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un tipo "${dto.name}" en ${category ? `la categoría "${category.name}"` : 'los tipos sin categoría'}`,
      );
    }

    const isActive = dto.isActive ?? true;
    if (dto.isDefault && !isActive) {
      throw new BadRequestException(
        'Un tipo inactivo no puede ser el predeterminado',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.documentType.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.documentType.create({
          data: { ...dto, isActive, isDefault: dto.isDefault ?? false },
          include: DOCUMENT_TYPE_INCLUDE,
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `Ya existe un tipo "${dto.name}" en ${category ? `la categoría "${category.name}"` : 'los tipos sin categoría'}`,
        );
      }
      throw error;
    }
  }

  async findAll(categoryId?: number) {
    return this.prisma.documentType.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: DOCUMENT_TYPE_INCLUDE,
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    });
  }

  async findActive(categoryId?: number) {
    return this.prisma.documentType.findMany({
      where: { isActive: true, ...(categoryId ? { categoryId } : {}) },
      include: DOCUMENT_TYPE_INCLUDE,
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    });
  }

  async findDefault() {
    return this.prisma.documentType.findFirst({
      where: { isDefault: true, isActive: true },
      include: DOCUMENT_TYPE_INCLUDE,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const documentType = await this.prisma.documentType.findUnique({
      where: { id },
      include: DOCUMENT_TYPE_INCLUDE,
    });
    if (!documentType) {
      throw new NotFoundException(
        `Tipo de documento con ID ${id} no encontrado`,
      );
    }
    return documentType;
  }

  async update(id: number, dto: UpdateDocumentTypeDto) {
    const current = await this.findOne(id);
    if (current.isDefault && dto.isActive === false) {
      throw new BadRequestException(
        'El tipo predeterminado no puede desactivarse',
      );
    }
    if (current.isDefault && dto.isDefault === false) {
      throw new BadRequestException(
        'Seleccione otro tipo predeterminado antes de quitar el actual',
      );
    }
    if (dto.isDefault && (dto.isActive ?? current.isActive) === false) {
      throw new BadRequestException(
        'Un tipo inactivo no puede ser el predeterminado',
      );
    }

    // Si cambia nombre o categoría, verificar unicidad
    if (dto.name !== undefined || dto.categoryId !== undefined) {
      const newName = dto.name ?? current.name;
      const newCategoryId =
        dto.categoryId !== undefined ? dto.categoryId : current.categoryId;

      if (newCategoryId != null) {
        const categoryExists = await this.prisma.category.findUnique({
          where: { id: newCategoryId },
        });
        if (!categoryExists) {
          throw new NotFoundException(
            `Categoría con ID ${newCategoryId} no encontrada`,
          );
        }
      }

      const conflict = await this.prisma.documentType.findFirst({
        where: { name: newName, categoryId: newCategoryId ?? null },
      });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(
          `Ya existe un tipo "${newName}" con la misma clasificación`,
        );
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.documentType.updateMany({
            where: { isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }
        return tx.documentType.update({
          where: { id },
          data: dto,
          include: DOCUMENT_TYPE_INCLUDE,
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `Ya existe un tipo "${dto.name ?? current.name}" en la categoría seleccionada`,
        );
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);

    // Plantillas are decoupled from types: the `DocumentTemplate.documentTypeId`
    // foreign key is ON DELETE SET NULL, so deleting the type detaches its
    // templates instead of blocking the operation. Only documents keep the
    // type undeletable because they are the historical record.
    const counts = await this.prisma.documentType.findUnique({
      where: { id },
      select: { _count: { select: { documents: true } } },
    });

    const documents = counts?._count.documents ?? 0;
    if (documents > 0) {
      throw new BadRequestException(
        `No se puede eliminar el tipo porque tiene ${documents} documento(s) asociados`,
      );
    }

    await this.prisma.documentType.delete({ where: { id } });
    return { message: 'Tipo de documento eliminado correctamente' };
  }
}
