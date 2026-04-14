import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';
import { ExplainPermissionDto } from './dto/explain-permission.dto';
import { UserRole } from '../auth/role.enum';

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  // ============ Permisos Específicos de Documentos ============

  async grantDocumentPermission(
    documentId: number,
    grantedById: string,
    grantDto: GrantDocumentPermissionDto,
  ) {
    const { userId, role, departmentId, ...permissions } = grantDto;

    if (!userId && !role && !departmentId) {
      throw new BadRequestException(
        'Debe proporcionar al menos userId, role o departmentId',
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

    if (userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }
    }

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException(
          `Departamento con ID ${departmentId} no encontrado`,
        );
      }
    }

    return this.prisma.documentPermission.create({
      data: {
        documentId,
        userId,
        role,
        departmentId,
        grantedById,
        ...permissions,
        expiresAt: grantDto.expiresAt ? new Date(grantDto.expiresAt) : null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true, code: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
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
        department: { select: { id: true, name: true, code: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async explainPermission(dto: ExplainPermissionDto) {
    const { documentId, userId } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        shares: {
          where: {
            OR: [
              { userId: user.id },
              { role: user.role },
              ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
            ],
          },
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
    const validPermissions = document.shares.filter(
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
        if (user.departmentId) {
          if (document.academic?.course?.departmentId === user.departmentId) {
            hasAccess = true;
            reasons.push('El documento pertenece a un curso gestionado por el departamento del coordinador');
          }
          if (document.uploadedBy?.departmentId === user.departmentId) {
            hasAccess = true;
            reasons.push('El documento fue subido por otro miembro de su mismo departamento');
          }
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
        if (user.departmentId && document.uploadedBy?.departmentId === user.departmentId) {
          hasAccess = true;
          reasons.push('El documento fue subido por un usuario de su mismo departamento administrativo');
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
