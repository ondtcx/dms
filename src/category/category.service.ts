import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    // Verificar que no exista una categoría con el mismo nombre
    const existing = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una categoría con el nombre "${createCategoryDto.name}"`,
      );
    }

    const category = await this.prisma.category.create({
      data: createCategoryDto,
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });

    return category;
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: {
        _count: {
          select: { documents: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return categories;
  }

  async findAllActive() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { documents: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return categories;
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return category;
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    // Verificar que existe
    await this.findOne(id);

    // Si se está cambiando el nombre, verificar que no exista otra con ese nombre
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

    const category = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });

    return category;
  }

  async remove(id: number) {
    // Verificar que existe
    await this.findOne(id);

    // Verificar si tiene documentos asociados
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });

    if (category._count.documents > 0) {
      throw new BadRequestException(
        `No se puede eliminar la categoría porque tiene ${category._count.documents} documento(s) asociado(s). Primero reasigna o elimina los documentos.`,
      );
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: 'Categoría eliminada exitosamente' };
  }
}
