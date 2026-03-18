import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCourseDto } from './dto/query-course.dto';

@Injectable()
export class CourseService {
  constructor(private prisma: PrismaService) {}

  async create(createCourseDto: CreateCourseDto) {
    // Verificar si ya existe un curso con ese código
    const existing = await this.prisma.course.findUnique({
      where: { code: createCourseDto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un curso con el código "${createCourseDto.code}"`,
      );
    }

    // Verificar si el departamento existe (si se proporciona)
    if (createCourseDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: createCourseDto.departmentId },
      });

      if (!department) {
        throw new NotFoundException(
          `Departamento con ID ${createCourseDto.departmentId} no encontrado`,
        );
      }
    }

    return this.prisma.course.create({
      data: createCourseDto,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            subjects: true,
            teachers: true,
            documents: true,
          },
        },
      },
    });
  }

  async findAll(query: QueryCourseDto) {
    const {
      search,
      level,
      departmentId,
      academicYear,
      isActive,
      page = 1,
      limit = 10,
    } = query;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (level) {
      where.level = level;
    }

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (academicYear) {
      where.academicYear = academicYear;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          _count: {
            select: {
              subjects: true,
              teachers: true,
              documents: true,
            },
          },
        },
      }),
      this.prisma.course.count({ where }),
    ]);

    return {
      data: courses,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        subjects: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            subjects: true,
            teachers: true,
            documents: true,
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException(`Curso con ID ${id} no encontrado`);
    }

    return course;
  }

  async findSubjects(courseId: number) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) {
      throw new NotFoundException(`Curso con ID ${courseId} no encontrado`);
    }
    return this.prisma.subject.findMany({
      where: { courseId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: number, updateCourseDto: UpdateCourseDto) {
    await this.findOne(id);

    // Si se actualiza el código, verificar que no exista otro con ese código
    if (updateCourseDto.code) {
      const existing = await this.prisma.course.findFirst({
        where: {
          code: updateCourseDto.code,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe otro curso con el código "${updateCourseDto.code}"`,
        );
      }
    }

    // Verificar departamento si se actualiza
    if (updateCourseDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updateCourseDto.departmentId },
      });

      if (!department) {
        throw new NotFoundException(
          `Departamento con ID ${updateCourseDto.departmentId} no encontrado`,
        );
      }
    }

    return this.prisma.course.update({
      where: { id },
      data: updateCourseDto,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            subjects: true,
            teachers: true,
            documents: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    const course = await this.findOne(id);

    if (course._count.subjects > 0) {
      throw new BadRequestException(
        `No se puede eliminar el curso porque tiene ${course._count.subjects} materia(s) asociada(s)`,
      );
    }

    if (course._count.teachers > 0) {
      throw new BadRequestException(
        `No se puede eliminar el curso porque tiene ${course._count.teachers} profesor(es) asignado(s)`,
      );
    }

    if (course._count.documents > 0) {
      throw new BadRequestException(
        `No se puede eliminar el curso porque tiene ${course._count.documents} documento(s) asociado(s)`,
      );
    }

    await this.prisma.course.delete({
      where: { id },
    });

    return {
      message: `Curso "${course.name}" eliminado exitosamente`,
    };
  }

  async assignTeacher(courseId: number, userId: string) {
    // Verificar que el curso existe
    await this.findOne(courseId);

    // Verificar que el usuario existe
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    // Verificar si ya está asignado
    const existing = await this.prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `El profesor ya está asignado a este curso`,
      );
    }

    return this.prisma.userCourse.create({
      data: {
        userId,
        courseId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        course: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async removeTeacher(courseId: number, userId: string) {
    const userCourse = await this.prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (!userCourse) {
      throw new NotFoundException(
        `El profesor no está asignado a este curso`,
      );
    }

    await this.prisma.userCourse.delete({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    return {
      message: 'Profesor removido del curso exitosamente',
    };
  }
}
