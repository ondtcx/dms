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
    select: { documents: true, documentTemplates: true },
  },
} as const;

@Injectable()
export class DocumentTypeService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDocumentTypeDto) {
    // Verificar que la categoría existe
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Categoría con ID ${dto.categoryId} no encontrada`,
      );
    }

    // Verificar unicidad dentro de la categoría
    const existing = await this.prisma.documentType.findUnique({
      where: {
        name_categoryId: { name: dto.name, categoryId: dto.categoryId },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un subtipo "${dto.name}" en la categoría "${category.name}"`,
      );
    }

    const isActive = dto.isActive ?? true;
    if (dto.isDefault && !isActive) {
      throw new BadRequestException(
        'Un subtipo inactivo no puede ser el predeterminado',
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
          'No se pudo establecer el subtipo predeterminado porque otro cambio concurrente lo estableció',
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
        `Subtipo de documento con ID ${id} no encontrado`,
      );
    }
    return documentType;
  }

  async update(id: number, dto: UpdateDocumentTypeDto) {
    const current = await this.findOne(id);

    // Si cambia nombre o categoría, verificar unicidad
    if (dto.name !== undefined || dto.categoryId !== undefined) {
      const newName = dto.name ?? current.name;
      const newCategoryId = dto.categoryId ?? current.categoryId;

      const conflict = await this.prisma.documentType.findUnique({
        where: {
          name_categoryId: { name: newName, categoryId: newCategoryId },
        },
      });
      if (conflict && conflict.id !== id) {
        const category = await this.prisma.category.findUnique({
          where: { id: newCategoryId },
        });
        throw new ConflictException(
          `Ya existe un subtipo "${newName}" en la categoría "${category?.name}"`,
        );
      }
    }

    const isActive = dto.isActive ?? current.isActive;
    if (dto.isDefault === true && !isActive) {
      throw new BadRequestException(
        'Un subtipo inactivo no puede ser el predeterminado',
      );
    }

    const data = {
      ...dto,
      ...(dto.isActive === false ? { isDefault: false } : {}),
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault === true) {
          await tx.documentType.updateMany({
            where: { isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }

        return tx.documentType.update({
          where: { id },
          data,
          include: DOCUMENT_TYPE_INCLUDE,
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'No se pudo establecer el subtipo predeterminado porque otro cambio concurrente lo estableció',
        );
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);

    const counts = await this.prisma.documentType.findUnique({
      where: { id },
      select: {
        _count: { select: { documents: true, documentTemplates: true } },
      },
    });

    const total =
      (counts?._count.documents ?? 0) + (counts?._count.documentTemplates ?? 0);
    if (total > 0) {
      throw new BadRequestException(
        `No se puede eliminar el subtipo porque tiene ${counts!._count.documents} documento(s) y ${counts!._count.documentTemplates} plantilla(s) asociadas`,
      );
    }

    await this.prisma.documentType.delete({ where: { id } });
    return { message: 'Subtipo de documento eliminado correctamente' };
  }
}
