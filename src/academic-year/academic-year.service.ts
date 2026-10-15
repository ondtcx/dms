import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { calendarDate, periodDay } from '../document/upload-date';
import { Prisma } from '@prisma/client';

@Injectable()
export class AcademicYearService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const years = await this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { documentAcademics: true } } },
    });

    // Contar cursos por año lectivo en una sola query (evita N+1)
    const courseCounts = await this.prisma.course.groupBy({
      by: ['academicYear'],
      _count: { id: true },
    });
    const levelMap = new Map(
      courseCounts.map((c) => [c.academicYear, c._count.id]),
    );

    const data = years.map((year) => ({
      ...year,
      _count: {
        levels: levelMap.get(year.name) ?? 0,
        documents: year._count.documentAcademics,
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
      include: { _count: { select: { documentAcademics: true } } },
    });

    if (!year)
      throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);

    const courseCount = await this.prisma.course.count({
      where: { academicYear: year.name },
    });

    return {
      ...year,
      _count: { levels: courseCount, documents: year._count.documentAcademics },
    };
  }

  async create(dto: CreateAcademicYearDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261008, 1)::text`;
        const startDate = calendarDate(dto.startDate);
        const endDate = calendarDate(dto.endDate);
        await this.assertInterval(tx, startDate, endDate);
        if (dto.isCurrent)
          await tx.academicYear.updateMany({ data: { isCurrent: false } });
        return tx.academicYear.create({ data: { ...dto, startDate, endDate } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async update(id: number, dto: UpdateAcademicYearDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261008, 1)::text`;
        const year = await tx.academicYear.findUnique({ where: { id } });
        if (!year)
          throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);
        const startDate =
          dto.startDate === undefined
            ? calendarDate(periodDay(year.startDate))
            : calendarDate(dto.startDate);
        const endDate =
          dto.endDate === undefined
            ? calendarDate(periodDay(year.endDate))
            : calendarDate(dto.endDate);
        if (
          periodDay(startDate) !== periodDay(year.startDate) ||
          periodDay(endDate) !== periodDay(year.endDate)
        ) {
          await this.assertInterval(tx, startDate, endDate, id);
        }
        if (dto.isCurrent)
          await tx.academicYear.updateMany({ data: { isCurrent: false } });
        return tx.academicYear.update({
          where: { id },
          data: {
            ...dto,
            ...(dto.startDate === undefined ? {} : { startDate }),
            ...(dto.endDate === undefined ? {} : { endDate }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async assertInterval(
    tx: Prisma.TransactionClient,
    startDate: Date,
    endDate: Date,
    ownId?: number,
  ) {
    if (startDate > endDate)
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin',
      );
    const years = await tx.academicYear.findMany({
      select: { id: true, startDate: true, endDate: true },
    });
    if (
      years.some(
        (year) =>
          year.id !== ownId &&
          periodDay(year.startDate) <= periodDay(endDate) &&
          periodDay(startDate) <= periodDay(year.endDate),
      )
    ) {
      throw new ConflictException(
        'El intervalo se superpone con otro año lectivo',
      );
    }
  }

  async setCurrent(id: number) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year)
      throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);
    if (!year.isActive)
      throw new BadRequestException(
        'No se puede marcar como actual un año lectivo inactivo',
      );

    return this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ data: { isCurrent: false } });
      return tx.academicYear.update({
        where: { id },
        data: { isCurrent: true },
      });
    });
  }

  async deactivate(id: number) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year)
      throw new NotFoundException(`Año lectivo con ID ${id} no encontrado`);

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
