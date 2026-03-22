import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { QuerySectionDto } from './dto/query-section.dto';

// Los documentos de una sección se cuentan via las categorías que le pertenecen
const SECTION_INCLUDE = {
  _count: {
    select: { categories: true },
  },
};

@Injectable()
export class SectionService {
  constructor(private prisma: PrismaService) {}

  async create(createSectionDto: CreateSectionDto) {
    const existing = await this.prisma.section.findUnique({
      where: { name: createSectionDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una sección con el nombre "${createSectionDto.name}"`,
      );
    }

    return this.prisma.section.create({
      data: createSectionDto,
      include: SECTION_INCLUDE,
    });
  }

  async findAll(query: QuerySectionDto) {
    const { search, isActive, page = 1, limit = 10 } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = (page - 1) * limit;

    const [sections, total] = await Promise.all([
      this.prisma.section.findMany({
        where,
        include: SECTION_INCLUDE,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.section.count({ where }),
    ]);

    return {
      data: sections,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: SECTION_INCLUDE,
    });

    if (!section) {
      throw new NotFoundException('Sección no encontrada');
    }

    return section;
  }

  async update(id: number, updateSectionDto: UpdateSectionDto) {
    await this.findOne(id);

    if (updateSectionDto.name) {
      const existing = await this.prisma.section.findUnique({
        where: { name: updateSectionDto.name },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Ya existe una sección con el nombre "${updateSectionDto.name}"`,
        );
      }
    }

    return this.prisma.section.update({
      where: { id },
      data: updateSectionDto,
      include: SECTION_INCLUDE,
    });
  }

  async remove(id: number) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { _count: { select: { categories: true } } },
    });

    if (!section) {
      throw new NotFoundException('Sección no encontrada');
    }

    if (section._count.categories > 0) {
      throw new ConflictException(
        `No se puede eliminar la sección porque tiene ${section._count.categories} categoría(s) asociada(s). Primero reasigna las categorías.`,
      );
    }

    await this.prisma.section.delete({ where: { id } });

    return { message: 'Sección eliminada exitosamente' };
  }

  async getStats() {
    const sections = await this.prisma.section.findMany({
      where: { isActive: true },
      include: {
        categories: {
          select: {
            _count: { select: { documents: true } },
          },
        },
        _count: { select: { categories: true } },
      },
      orderBy: { name: 'asc' },
    });

    return sections.map((section) => ({
      id: section.id,
      name: section.name,
      color: section.color,
      icon: section.icon,
      categoryCount: section._count.categories,
      documentCount: section.categories.reduce(
        (sum, cat) => sum + cat._count.documents,
        0,
      ),
    }));
  }
}
