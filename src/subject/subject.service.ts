import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';

@Injectable()
export class SubjectService {
  constructor(private prisma: PrismaService) {}

  async create(createSubjectDto: CreateSubjectDto) {
    // Verificar si ya existe una materia con ese código
    const existing = await this.prisma.subject.findUnique({
      where: { code: createSubjectDto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una materia con el código "${createSubjectDto.code}"`,
      );
    }

    // Verificar si el curso existe (si se proporciona)
    if (createSubjectDto.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: createSubjectDto.courseId },
      });

      if (!course) {
        throw new NotFoundException(
          `Curso con ID ${createSubjectDto.courseId} no encontrado`,
        );
      }
    }

    return this.prisma.subject.create({
      data: createSubjectDto,
      include: {
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            level: true,
          },
        },
        _count: {
          select: {
            teachers: true,
            documentAcademics: true,
          },
        },
      },
    });
  }

  async findAll(query: QuerySubjectDto) {
    const { search, courseId, isActive, page = 1, limit = 10 } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (courseId) {
      where.courseId = courseId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = (page - 1) * limit;

    const [subjects, total] = await Promise.all([
      this.prisma.subject.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          course: {
            select: {
              id: true,
              name: true,
              code: true,
              level: true,
            },
          },
          _count: {
            select: {
              teachers: true,
              documentAcademics: true,
            },
          },
        },
      }),
      this.prisma.subject.count({ where }),
    ]);

    return {
      data: subjects,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            level: true,
          },
        },
        _count: {
          select: {
            teachers: true,
            documentAcademics: true,
          },
        },
      },
    });

    if (!subject) {
      throw new NotFoundException(`Materia con ID ${id} no encontrada`);
    }

    return subject;
  }

  async update(id: number, updateSubjectDto: UpdateSubjectDto) {
    await this.findOne(id);

    // Si se actualiza el código, verificar que no exista otro con ese código
    if (updateSubjectDto.code) {
      const existing = await this.prisma.subject.findFirst({
        where: {
          code: updateSubjectDto.code,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe otra materia con el código "${updateSubjectDto.code}"`,
        );
      }
    }

    // Verificar curso si se actualiza
    if (updateSubjectDto.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: updateSubjectDto.courseId },
      });

      if (!course) {
        throw new NotFoundException(
          `Curso con ID ${updateSubjectDto.courseId} no encontrado`,
        );
      }
    }

    return this.prisma.subject.update({
      where: { id },
      data: updateSubjectDto,
      include: {
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            level: true,
          },
        },
        _count: {
          select: {
            teachers: true,
            documentAcademics: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    const subject = await this.findOne(id);

    if (subject._count.teachers > 0) {
      throw new BadRequestException(
        `No se puede eliminar la materia porque tiene ${subject._count.teachers} profesor(es) asignado(s)`,
      );
    }

    if (subject._count.documentAcademics > 0) {
      throw new BadRequestException(
        `No se puede eliminar la materia porque tiene ${subject._count.documentAcademics} documento(s) asociado(s)`,
      );
    }

    await this.prisma.subject.delete({
      where: { id },
    });

    return {
      message: `Materia "${subject.name}" eliminada exitosamente`,
    };
  }

  async assignTeacher(subjectId: number, userId: string) {
    await this.findOne(subjectId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const existing = await this.prisma.userSubject.findUnique({
      where: {
        userId_subjectId: {
          userId,
          subjectId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `El profesor ya está asignado a esta materia`,
      );
    }

    return this.prisma.userSubject.create({
      data: {
        userId,
        subjectId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async removeTeacher(subjectId: number, userId: string) {
    const userSubject = await this.prisma.userSubject.findUnique({
      where: {
        userId_subjectId: {
          userId,
          subjectId,
        },
      },
    });

    if (!userSubject) {
      throw new NotFoundException(
        `El profesor no está asignado a esta materia`,
      );
    }

    await this.prisma.userSubject.delete({
      where: {
        userId_subjectId: {
          userId,
          subjectId,
        },
      },
    });

    return {
      message: 'Profesor removido de la materia exitosamente',
    };
  }
}
