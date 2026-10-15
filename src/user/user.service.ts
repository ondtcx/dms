import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User, UserRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

type PublicUser = Omit<User, 'password' | 'failedLoginAttempts' | 'lockedUntil' | 'lastActivityAt' | 'totpSecret' | 'totpPendingSecret' | 'totpEnabled' | 'totpRecoveryCodeHashes'> & {
  catalogRoles?: { id: number; key: string; label: string; isActive: boolean }[];
};

const userProjection = {
  id: true,
  email: true,
  name: true,
  role: true,
  authRevision: true,
  phoneNumber: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  roleAssignments: {
    select: { role: { select: { id: true, key: true, label: true, isActive: true } } },
  },
} as const;

function toUserProjection<T extends { roleAssignments?: { role: unknown }[] }>(user: T) {
  const { roleAssignments, ...projection } = user;
  return { ...projection, catalogRoles: (roleAssignments ?? []).map(({ role }) => role) };
}

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(user: CreateUserDto): Promise<PublicUser> {
    const { catalogRoleId, ...legacyUser } = user;
    if (catalogRoleId !== undefined && (!Number.isSafeInteger(catalogRoleId) || catalogRoleId < 1)) {
      throw new BadRequestException('Selecciona un único ID de rol válido');
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);

    if (catalogRoleId !== undefined) {
      return this.prisma.$transaction(
        async (tx) => {
          const role = await tx.role.findUnique({ where: { id: catalogRoleId } });
          if (!role) throw new NotFoundException('Rol no encontrado');
          if (!role.isActive) throw new ForbiddenException('No se puede asignar un rol inactivo');
          const createdUser = await tx.user.create({
            data: {
              ...legacyUser,
              password: hashedPassword,
              role: UserRole.user,
              roleAssignments: { create: { roleId: catalogRoleId } },
            },
            select: userProjection,
          });
          return toUserProjection(createdUser) as PublicUser;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    }

    const newUser = await this.prisma.user.create({
      data: {
        ...legacyUser,
        password: hashedPassword,
      },
    });

    const { password, failedLoginAttempts, lockedUntil, lastActivityAt, totpSecret, totpPendingSecret, totpEnabled, totpRecoveryCodeHashes, ...result } = newUser;

    return result;
  }

  async findAll(): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({ select: userProjection });
    return users.map(toUserProjection) as PublicUser[];
  }

  async findAllForSelection(
    excludeUserId?: string,
  ): Promise<{ id: string; name: string; email: string }[]> {
    return this.prisma.user.findMany({
      where: excludeUserId ? { id: { not: excludeUserId } } : undefined,
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  }

  async findById(id: string): Promise<PublicUser> {
    const userFound = await this.prisma.user.findUnique({ where: { id }, select: userProjection });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return toUserProjection(userFound) as PublicUser;
  }

  async findByEmail(email: string): Promise<any> {
    const userFound = await this.prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRevision: true,
        lastActivityAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
        password: true,
        totpSecret: true,
        totpEnabled: true,
        totpRecoveryCodeHashes: true,
        roleAssignments: {
          select: { role: { select: { id: true, key: true, label: true, isActive: true } } },
        },
      },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return toUserProjection(userFound);
  }

  async update(
    id: string,
    user: UpdateUserDto,
  ): Promise<PublicUser> {
    if (user.catalogRoleId !== undefined) {
      throw new BadRequestException('La selección de catálogo solo se admite al crear un usuario');
    }
    await this.findById(id); // Check if user exists

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: user,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRevision: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findById(id); // Check if user exists

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'User deleted successfully',
    };
  }
}
