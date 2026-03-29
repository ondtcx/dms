import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

@Injectable()
export class AcademicYearService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const years = await this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { documents: true } } },
    });

    // Contar cursos por año lectivo en una sola query (evita N+1)
    const courseCounts = await this.prisma.course.groupBy({
      by: ['academicYear'],
      _count: { id: true },
    });
    const levelMap = new Map(courseCounts.map((c) => [c.academicYear, c._count.id]));

    const data = years.map((year) => ({
      ...year,
      _count: {
        levels: levelMap.get(year.name) ?? 0,
        documents: year._count.documents,
      },
    }));

    return { data, total: data.length };
  }

  async findCurrent() {
    return this.prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
    });
  }

  async findOne(id: number) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id },
      include: { _count: { select: { documents: true } } },
    });

    if (!year) throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);

    const courseCount = await this.prisma.course.count({
      where: { academicYear: year.name },
    });

    return {
      ...year,
      _count: { levels: courseCount, documents: year._count.documents },
    };
  }

  async create(dto: CreateAcademicYearDto) {
    if (dto.isCurrent) {
      return this.prisma.$transaction(async (tx) => {
        await tx.academicYear.updateMany({ data: { isCurrent: false } });
        return tx.academicYear.create({ data: dto });
      });
    }
    return this.prisma.academicYear.create({ data: dto });
  }

  async update(id: number, dto: UpdateAcademicYearDto) {
    await this.findOne(id);

    if (dto.isCurrent) {
      return this.prisma.$transaction(async (tx) => {
        await tx.academicYear.updateMany({ data: { isCurrent: false } });
        return tx.academicYear.update({ where: { id }, data: dto });
      });
    }

    return this.prisma.academicYear.update({ where: { id }, data: dto });
  }

  async setCurrent(id: number) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);
    if (!year.isActive) throw new BadRequestException('No se puede marcar como actual un año lectivo inactivo');

    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
    });
  }

  async deactivate(id: number) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);

    if (year.isCurrent) {
      throw new ConflictException(
        'No se puede desactivar el año lectivo actual. Primero marca otro año como actual.',
      );
    }

    return this.prisma.academicYear.update({
      where: { id },
      data: { isActive: false, isCurrent: false },
    });
  }
}
