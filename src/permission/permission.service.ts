import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';
import { ExplainPermissionDto } from './dto/explain-permission.dto';
import { UserRole } from '../auth/role.enum';
import { buildRoleGrantFilter, resolveRoleGrantFields } from '../role/compatibility-resolver';
import { randomUUID } from 'crypto';
import { PermissionCatalogItemDto } from './dto/permission-catalog-item.dto';

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  getCatalog(): Promise<PermissionCatalogItemDto[]> {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      select: { id: true, key: true, label: true, isActive: true },
      orderBy: { key: 'asc' },
    });
  }

  // ============ Permisos Específicos de Documentos ============

  async grantDocumentPermission(
    documentId: number,
    grantedById: string,
    grantDto: GrantDocumentPermissionDto,
  ) {
    const { userId, role, roleKey, ...permissions } = grantDto;

    if (!userId && !role && !roleKey) {
      throw new BadRequestException(
        'Debe proporcionar al menos userId o role',
      );
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado`,
      );
    }

    const grantedBy = await this.prisma.user.findUnique({
      where: { id: grantedById },
    });

    if (!grantedBy) {
      throw new NotFoundException(
        `Usuario con ID ${grantedById} no encontrado`,
      );
    }

    const catalogRole = roleKey || role
      ? await this.prisma.role.findUnique({
          where: roleKey ? { key: roleKey } : { legacyRole: role },
          select: { id: true, isActive: true, legacyRole: true },
        })
      : null;
    if (roleKey && (!catalogRole || !catalogRole.isActive)) {
      throw new BadRequestException('El rol catalogado no existe o está inactivo');
    }

    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }
    }

    const grantFields = catalogRole
      ? resolveRoleGrantFields(roleKey ?? role, catalogRole.id, catalogRole.legacyRole)
      : { role: role ?? null, roleId: null };

    return this.prisma.documentPermission.create({
      data: {
        documentId,
        userId,
        ...grantFields,
        grantedById,
        ...permissions,
        expiresAt: grantDto.expiresAt ? new Date(grantDto.expiresAt) : null,
      } as any,
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async createDocumentShare(documentId: number, sharedById: string, shareDto: any) {
    const { role, roleKey, ...shareData } = shareDto;
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException(`Documento con ID ${documentId} no encontrado`);

    const sharedBy = await this.prisma.user.findUnique({ where: { id: sharedById } });
    if (!sharedBy) throw new NotFoundException(`Usuario con ID ${sharedById} no encontrado`);

    const catalogRole = roleKey || role
      ? await this.prisma.role.findUnique({
          where: roleKey ? { key: roleKey } : { legacyRole: role },
          select: { id: true, isActive: true, legacyRole: true },
        })
      : null;
    if ((roleKey || role) && (!catalogRole || !catalogRole.isActive)) {
      throw new BadRequestException('El rol no existe o está inactivo');
    }

    const grantFields = catalogRole
      ? resolveRoleGrantFields(roleKey ?? role, catalogRole.id, catalogRole.legacyRole)
      : { role: null, roleId: null };

    return this.prisma.documentShare.create({
      data: {
        documentId,
        sharedById,
        shareToken: randomUUID(),
        ...shareData,
        ...grantFields,
        expiresAt: shareDto.expiresAt ? new Date(shareDto.expiresAt) : null,
      },
    });
  }

  async revokeDocumentPermission(permissionId: number) {
    const permission = await this.prisma.documentPermission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException(
        `Permiso de documento con ID ${permissionId} no encontrado`,
      );
    }

    await this.prisma.documentPermission.delete({
      where: { id: permissionId },
    });

    return { message: 'Permiso de documento revocado exitosamente' };
  }

  async getDocumentPermissions(documentId: number) {
    return this.prisma.documentPermission.findMany({
      where: { documentId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async explainPermission(dto: ExplainPermissionDto) {
    const { documentId, userId } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { id: true, key: true, isActive: true } } },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        shares: {
          where: {
            ...buildRoleGrantFilter(
              user.id,
              user.role,
              (user.roleAssignments ?? []).map(({ role }) => role),
            ),
          },
        },
        permissions: {
          where: buildRoleGrantFilter(
            user.id,
            user.role,
            (user.roleAssignments ?? []).map(({ role }) => role),
          ),
        },
        uploadedBy: true,
        academic: {
          include: {
            course: { include: { teachers: true } },
            subject: { include: { teachers: true } },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Documento con ID ${documentId} no encontrado`);
    }

    let hasAccess = false;
    const reasons: string[] = [];

    if (user.role === UserRole.ADMIN || user.role === UserRole.RECTOR) {
      return {
        hasAccess: true,
        role: user.role,
        reasons: [`Acceso total concedido por tener rol privilegiado: ${user.role}`]
      };
    }

    if (document.uploadedById === user.id) {
      hasAccess = true;
      reasons.push('El usuario es el creador (uploader) del documento');
    }

    const now = new Date();
    const validPermissions = [...document.permissions, ...document.shares].filter(
      (p) => p.canView && (!p.expiresAt || p.expiresAt >= now),
    );

    if (validPermissions.length > 0) {
      hasAccess = true;
      reasons.push('El usuario cuenta con un permiso de visualización explícito activo sobre este documento');
    }

    switch (user.role as UserRole) {
      case UserRole.COORDINADOR:
        if (document.isPublic) {
          hasAccess = true;
          reasons.push('El documento es público');
        }
        break;

      case UserRole.PROFESOR:
        if (document.isPublic) {
          hasAccess = true;
          reasons.push('El documento es público');
        }
        const isTeacherInCourse = document.academic?.course?.teachers?.some((t) => t.userId === user.id);
        const isTeacherInSubject = document.academic?.subject?.teachers?.some((t) => t.userId === user.id);
        
        if (isTeacherInCourse) {
          hasAccess = true;
          reasons.push('El profesor está asignado formalmente al curso al que pertenece el documento');
        }
        if (isTeacherInSubject) {
          hasAccess = true;
          reasons.push('El profesor está asignado formalmente a la materia a la que pertenece el documento');
        }
        break;

      case UserRole.SECRETARIO:
        if (document.isPublic) {
          hasAccess = true;
          reasons.push('El documento es público');
        }
        break;

      case UserRole.ESTUDIANTE:
        if (document.isPublic) {
          const isStudentInCourse = document.academic?.course?.teachers?.some((t) => t.userId === user.id);
          const isStudentInSubject = document.academic?.subject?.teachers?.some((t) => t.userId === user.id);
          
          if (isStudentInCourse || isStudentInSubject) {
            hasAccess = true;
            reasons.push('El documento es público y pertenece a un curso/materia en la que el estudiante participa');
          }
        }
        break;

      case UserRole.PADRE:
      default:
        if (document.isPublic) {
          hasAccess = true;
          reasons.push('El documento es público');
        }
        break;
    }

    if (!hasAccess) {
      reasons.push('El usuario no cumple con ningún criterio para acceder al documento');
    }

    return {
      hasAccess,
      role: user.role,
      reasons: [...new Set(reasons)],
    };
  }
}
