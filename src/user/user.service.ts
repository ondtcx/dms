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
import { AuthorizationService } from '../auth/compatibility/authorization.service';

type PublicUser = Omit<User, 'password' | 'failedLoginAttempts' | 'lockedUntil' | 'lastActivityAt' | 'totpSecret' | 'totpPendingSecret' | 'totpEnabled' | 'totpRecoveryCodeHashes'> & {
  catalogRoles?: { id: number; key: string; label: string; isActive: boolean }[];
};

const userProjection = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  deactivatedAt: true,
  deactivatedById: true,
  deactivationReason: true,
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
  constructor(
    private prisma: PrismaService,
    private readonly authorization?: AuthorizationService,
  ) {}

  private async assertCanAssignLegacyRole(actorId: string | undefined, role: UserRole | undefined) {
    if (role === undefined || role === UserRole.user) return;
    if (!actorId || !this.authorization) {
      throw new ForbiddenException('Solo un administrador puede asignar roles legacy');
    }
    const { roles } = await this.authorization.getAuthorization(actorId);
    if (!roles.includes(UserRole.admin)) {
      throw new ForbiddenException('Solo un administrador puede asignar roles legacy');
    }
  }

  private async assertCanChangeLegacyRole(actorId: string | undefined) {
    if (!actorId || !this.authorization) {
      throw new ForbiddenException('Solo un administrador puede cambiar el rol legacy');
    }
    const { roles } = await this.authorization.getAuthorization(actorId);
    if (!roles.includes(UserRole.admin)) {
      throw new ForbiddenException('Solo un administrador puede cambiar el rol legacy');
    }
  }

  private async assertCanAssignCatalogRole(
    actorId: string | undefined,
    role: { key: string },
  ) {
    if (role.key !== UserRole.admin) return;
    if (!actorId || !this.authorization) {
      throw new ForbiddenException('Solo un administrador puede asignar el rol admin');
    }
    const { roles } = await this.authorization.getAuthorization(actorId);
    if (!roles.includes(UserRole.admin)) {
      throw new ForbiddenException('Solo un administrador puede asignar el rol admin');
    }
  }

  async create(user: CreateUserDto, actorId?: string): Promise<PublicUser> {
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

    if (catalogRoleId === undefined) {
      await this.assertCanAssignLegacyRole(actorId, user.role);
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);

    if (catalogRoleId !== undefined) {
      return this.prisma.$transaction(
        async (tx) => {
          const role = await tx.role.findUnique({ where: { id: catalogRoleId } });
          if (!role) throw new NotFoundException('Rol no encontrado');
          if (!role.isActive) throw new ForbiddenException('No se puede asignar un rol inactivo');
          await this.assertCanAssignCatalogRole(actorId, role);
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

  async findAll(status: 'active' | 'inactive' | 'all' = 'active'): Promise<PublicUser[]> {
    if (!['active', 'inactive', 'all'].includes(status)) {
      throw new BadRequestException('Estado de usuario inválido');
    }
    const where =
      status === 'all'
        ? undefined
        : { isActive: status === 'active' };
    const users = await this.prisma.user.findMany({ where, select: userProjection });
    return users.map(toUserProjection) as PublicUser[];
  }

  async findAllForSelection(
    excludeUserId?: string,
  ): Promise<{ id: string; name: string; email: string }[]> {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
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
        isActive: true,
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
    actorId?: string,
  ): Promise<PublicUser> {
    if (user.catalogRoleId !== undefined) {
      throw new BadRequestException('La selección de catálogo solo se admite al crear un usuario');
    }
    const existingUser = await this.findById(id); // Check if user exists
    const roleChanged = user.role !== undefined && user.role !== existingUser.role;
    if (roleChanged) {
      await this.assertCanChangeLegacyRole(actorId);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: roleChanged
        ? { ...user, authRevision: { increment: 1 } }
        : user,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        deactivatedAt: true,
        deactivatedById: true,
        deactivationReason: true,
        authRevision: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async deactivate(
    id: string,
    actorId: string,
    reason?: string,
  ): Promise<{ message: string }> {
    if (id === actorId) {
      throw new ConflictException('No puedes desactivar tu propia cuenta');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const userFound = await tx.user.findUnique({ where: { id }, select: userProjection });
        if (!userFound) {
          throw new NotFoundException('User not found');
        }
        const user = toUserProjection(userFound) as PublicUser;
        if (user.isActive === false) {
          throw new ConflictException('El usuario ya está desactivado');
        }

        const [workflowAssignments, authoredChangeRequests, receivedChangeRequests] = await Promise.all([
          tx.workflowAssignment.count({
            where: { userId: id, status: 'PENDING', workflow: { active: true } },
          }),
          tx.documentChangeRequest.count({
            where: {
              requestedById: id,
              status: { in: ['PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED'] },
            },
          }),
          tx.documentChangeRequest.count({
            where: {
              recipientId: id,
              status: { in: ['PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED'] },
            },
          }),
        ]);

        const changeRequests = authoredChangeRequests + receivedChangeRequests;
        if (workflowAssignments > 0 || changeRequests > 0) {
          throw new ConflictException({
            message: 'El usuario tiene trabajo pendiente. Reasigna o cierra sus tareas antes de desactivarlo.',
            pending: { workflowAssignments, changeRequests },
          });
        }

        const targetRoles = new Set([
          user.role,
          ...(user.catalogRoles ?? []).map((role) => role.key),
        ]);
        if (targetRoles.has(UserRole.admin)) {
          const otherActiveAdmins = await tx.user.count({
            where: {
              id: { not: id },
              isActive: true,
              OR: [
                { role: UserRole.admin },
                { roleAssignments: { some: { role: { key: UserRole.admin, isActive: true } } } },
              ],
            },
          });
          if (otherActiveAdmins === 0) {
            throw new ConflictException('No puedes desactivar al último administrador activo');
          }
        }

        await tx.user.update({
          where: { id },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedById: actorId,
            deactivationReason: reason ?? null,
            authRevision: { increment: 1 },
          },
        });
        await tx.passwordResetToken.deleteMany({
          where: { userId: id, usedAt: null },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { message: 'Usuario desactivado exitosamente' };
  }

  async reactivate(id: string, _actorId: string): Promise<{ message: string }> {
    const user = await this.findById(id);
    if (user.isActive !== false) {
      throw new ConflictException('El usuario ya está activo');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedById: null,
        deactivationReason: null,
        authRevision: { increment: 1 },
      },
    });

    return { message: 'Usuario reactivado exitosamente' };
  }
}
