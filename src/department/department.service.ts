import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { QueryDepartmentDto } from './dto/query-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  async create(createDepartmentDto: CreateDepartmentDto) {
    // Verificar si ya existe un departamento con ese nombre
    const existingByName = await this.prisma.department.findUnique({
      where: { name: createDepartmentDto.name },
    });

    if (existingByName) {
      throw new ConflictException(
        `Ya existe un departamento con el nombre "${createDepartmentDto.name}"`,
      );
    }

    // Verificar si ya existe un departamento con ese código
    const existingByCode = await this.prisma.department.findUnique({
      where: { code: createDepartmentDto.code },
    });

    if (existingByCode) {
      throw new ConflictException(
        `Ya existe un departamento con el código "${createDepartmentDto.code}"`,
      );
    }

    return this.prisma.department.create({
      data: createDepartmentDto,
      include: {
        _count: {
          select: {
            users: true,
            courses: true,
          },
        },
      },
    });
  }

  async findAll(query: QueryDepartmentDto) {
    const { search, isActive, page = 1, limit = 10 } = query;

    // Construir where clause dinámicamente
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = (page - 1) * limit;

    // Ejecutar queries en paralelo
    const [departments, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              courses: true,
            },
          },
        },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data: departments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            courses: true,
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException(`Departamento con ID ${id} no encontrado`);
    }

    return department;
  }

  async update(id: number, updateDepartmentDto: UpdateDepartmentDto) {
    // Verificar que existe
    await this.findOne(id);

    // Si se actualiza el nombre, verificar que no exista otro con ese nombre
    if (updateDepartmentDto.name) {
      const existing = await this.prisma.department.findFirst({
        where: {
          name: updateDepartmentDto.name,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe otro departamento con el nombre "${updateDepartmentDto.name}"`,
        );
      }
    }

    // Si se actualiza el código, verificar que no exista otro con ese código
    if (updateDepartmentDto.code) {
      const existing = await this.prisma.department.findFirst({
        where: {
          code: updateDepartmentDto.code,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe otro departamento con el código "${updateDepartmentDto.code}"`,
        );
      }
    }

    return this.prisma.department.update({
      where: { id },
      data: updateDepartmentDto,
      include: {
        _count: {
          select: {
            users: true,
            courses: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    const department = await this.findOne(id);

    // Verificar si tiene usuarios o cursos asociados
    if (department._count.users > 0) {
      throw new BadRequestException(
        `No se puede eliminar el departamento porque tiene ${department._count.users} usuario(s) asociado(s)`,
      );
    }

    if (department._count.courses > 0) {
      throw new BadRequestException(
        `No se puede eliminar el departamento porque tiene ${department._count.courses} curso(s) asociado(s)`,
      );
    }

    await this.prisma.department.delete({
      where: { id },
    });

    return {
      message: `Departamento "${department.name}" eliminado exitosamente`,
    };
  }

  async getUsers(departmentId: number) {
    await this.findOne(departmentId);

    return this.prisma.user.findMany({
      where: { departmentId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async assignUser(departmentId: number, userId: string) {
    await this.findOne(departmentId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { departmentId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
      },
    });
  }

  async removeUser(departmentId: number, userId: string) {
    await this.findOne(departmentId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    if (user.departmentId !== departmentId) {
      throw new BadRequestException(
        'El usuario no pertenece a este departamento',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { departmentId: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
      },
    });
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      this.prisma.department.count(),
      this.prisma.department.count({ where: { isActive: true } }),
      this.prisma.department.count({ where: { isActive: false } }),
    ]);

    return {
      total,
      active,
      inactive,
    };
  }
}
