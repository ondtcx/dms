import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const CATEGORY_INCLUDE = {
  section: {
    select: { id: true, name: true, color: true, icon: true },
  },
  _count: {
    select: { documents: true, documentTypes: true },
  },
};

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una categoría con el nombre "${createCategoryDto.name}"`,
      );
    }

    const { roleIds, ...data } = createCategoryDto;

    return this.prisma.category.create({
      data: {
        ...data,
        ...(roleIds && {
          categoryRoles: {
            create: roleIds.map((roleId) => ({ roleId })),
          },
        }),
      },
      include: CATEGORY_INCLUDE,
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      include: CATEGORY_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findAllActive() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      include: CATEGORY_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_INCLUDE,
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id);

    if (updateCategoryDto.name) {
      const existing = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Ya existe una categoría con el nombre "${updateCategoryDto.name}"`,
        );
      }
    }

    const { roleIds, ...data } = updateCategoryDto;

    return this.prisma.category.update({
      where: { id },
      data: {
        ...data,
        ...(roleIds !== undefined && {
          categoryRoles: {
            deleteMany: {},
            ...(roleIds.length > 0 && {
              create: roleIds.map((roleId) => ({ roleId })),
            }),
          },
        }),
      },
      include: CATEGORY_INCLUDE,
    });
  }

  async remove(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    if (category._count.documents > 0) {
      throw new BadRequestException(
        `No se puede eliminar la categoría porque tiene ${category._count.documents} documento(s) asociado(s). Primero reasigna o elimina los documentos.`,
      );
    }

    await this.prisma.category.delete({ where: { id } });

    return { message: 'Categoría eliminada exitosamente' };
  }
}
