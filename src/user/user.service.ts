import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditResource, Prisma, User, UserRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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
  anonymizedAt: true,
  anonymizedById: true,
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
    if (existingUser.anonymizedAt) {
      throw new ForbiddenException('El usuario está anonimizado y no puede modificarse');
    }
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
        anonymizedAt: true,
        anonymizedById: true,
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
        if (user.anonymizedAt) {
          throw new ConflictException('El usuario está anonimizado');
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
    if (user.anonymizedAt) {
      throw new ConflictException('El usuario está anonimizado y no puede reactivarse');
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

  async anonymize(
    id: string,
    actorId: string,
  ): Promise<{ message: string; anonymizedAt: Date }> {
    if (id === actorId) {
      throw new ConflictException('No puedes anonimizar tu propia cuenta');
    }

    const unusablePassword = await bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
      10,
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id },
          select: {
            id: true,
            isActive: true,
            deactivatedAt: true,
            anonymizedAt: true,
          },
        });
        if (!user) throw new NotFoundException('User not found');
        if (user.anonymizedAt) {
          throw new ConflictException('El usuario ya está anonimizado');
        }
        if (user.isActive) {
          throw new ConflictException(
            'Desactiva al usuario antes de anonimizarlo',
          );
        }

        const [
          ownedDocuments,
          pendingTransfers,
          activeWorkflows,
          activeChangeRequests,
        ] = await Promise.all([
          tx.document.count({ where: { uploadedById: id } }),
          tx.transferHistory.count({
            where: { toUserId: id, status: 'PENDING' },
          }),
          tx.documentWorkflow.count({
            where: { initiatedById: id, active: true },
          }),
          tx.documentChangeRequest.count({
            where: {
              OR: [{ requestedById: id }, { recipientId: id }],
              status: {
                in: ['PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED'],
              },
            },
          }),
        ]);

        if (
          ownedDocuments > 0 ||
          pendingTransfers > 0 ||
          activeWorkflows > 0 ||
          activeChangeRequests > 0
        ) {
          throw new ConflictException({
            message:
              'El usuario todavía tiene documentos, transferencias o trabajo activo. Resuélvelo antes de anonimizarlo.',
            pending: {
              documents: ownedDocuments,
              transfers: pendingTransfers,
              workflows: activeWorkflows,
              changeRequests: activeChangeRequests,
            },
          });
        }

        const purged = {
          passwordResetTokens: (
            await tx.passwordResetToken.deleteMany({ where: { userId: id } })
          ).count,
          notifications: (
            await tx.notification.deleteMany({ where: { userId: id } })
          ).count,
          notificationPreferences: (
            await tx.notificationPreference.deleteMany({ where: { userId: id } })
          ).count,
          searchHistory: (
            await tx.searchHistory.deleteMany({ where: { userId: id } })
          ).count,
          documentAccesses: (
            await tx.documentAccess.deleteMany({ where: { userId: id } })
          ).count,
          shareAccesses: (
            await tx.shareAccess.deleteMany({ where: { userId: id } })
          ).count,
          directoryUsages: (
            await tx.userDirectoryUsage.deleteMany({ where: { userId: id } })
          ).count,
          navigationEvents: (
            await tx.directoryNavigationEvent.deleteMany({
              where: { userId: id },
            })
          ).count,
          commentReactions: (
            await tx.commentReaction.deleteMany({ where: { userId: id } })
          ).count,
          courseAssignments: (
            await tx.userCourse.deleteMany({ where: { userId: id } })
          ).count,
          subjectAssignments: (
            await tx.userSubject.deleteMany({ where: { userId: id } })
          ).count,
          directoryParticipants: (
            await tx.directoryUserParticipant.deleteMany({
              where: { userId: id },
            })
          ).count,
          directoryDelegates: (
            await tx.directoryDelegate.deleteMany({ where: { userId: id } })
          ).count,
          receivedPermissions: (
            await tx.documentPermission.deleteMany({ where: { userId: id } })
          ).count,
          receivedShares: (
            await tx.documentShare.deleteMany({ where: { userId: id } })
          ).count,
          receivedGrants: (
            await tx.accessGrant.deleteMany({
              where: { userId: id, delegatedGrants: { none: {} } },
            })
          ).count,
          reportExecutions: (
            await tx.reportExecution.deleteMany({
              where: { executedById: id },
            })
          ).count,
          auditRedactions: (
            await tx.auditLog.updateMany({
              where: { actorId: id },
              data: {
                actorEmail: null,
                actorName: null,
                ipAddress: null,
                userAgent: null,
              },
            })
          ).count,
        };

        const anonymizedAt = new Date();
        await tx.user.update({
          where: { id },
          data: {
            email: `anon-${id}@anon.invalid`,
            name: 'Usuario anonimizado',
            phoneNumber: null,
            position: null,
            password: unusablePassword,
            isActive: false,
            deactivatedAt: user.deactivatedAt ?? new Date(),
            deactivationReason: null,
            anonymizedAt,
            anonymizedById: actorId,
            authRevision: { increment: 1 },
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastActivityAt: new Date(0),
            totpEnabled: false,
            totpSecret: null,
            totpPendingSecret: null,
            totpRecoveryCodeHashes: [],
          },
        });

        const actor = await tx.user.findUnique({
          where: { id: actorId },
          select: { email: true, name: true, role: true },
        });
        await tx.auditLog.create({
          data: {
            action: AuditAction.ANONYMIZE,
            resource: AuditResource.USER,
            resourceId: id,
            documentId: null,
            actorId,
            actorEmail: actor?.email ?? null,
            actorName: actor?.name ?? null,
            actorRole: actor?.role ?? null,
            metadata: { anonymizedUserId: id, purged },
          },
        });

        return { anonymizedAt };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      message: 'Usuario anonimizado exitosamente',
      anonymizedAt: result.anonymizedAt,
    };
  }
}
