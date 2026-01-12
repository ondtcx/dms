import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { AssignPermissionDto } from './dto/assign-permission.dto';
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';
import { UserRole } from '../auth/role.enum';

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  // Jerarquía de roles (de mayor a menor privilegio)
  private roleHierarchy: Record<UserRole, number> = {
    [UserRole.ADMIN]: 9,
    [UserRole.DIRECTOR]: 8,
    [UserRole.COORDINADOR]: 7,
    [UserRole.MODERADOR]: 6,
    [UserRole.PROFESOR]: 5,
    [UserRole.SECRETARIO]: 4,
    [UserRole.USER]: 3,
    [UserRole.PADRE]: 2,
    [UserRole.ESTUDIANTE]: 1,
  };

  // ============ CRUD de Permisos ============

  async createPermission(createPermissionDto: CreatePermissionDto) {
    // Verificar si ya existe un permiso con ese nombre
    const existing = await this.prisma.permission.findUnique({
      where: { name: createPermissionDto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un permiso con el nombre "${createPermissionDto.name}"`,
      );
    }

    // Verificar combinación resource+action
    const existingCombo = await this.prisma.permission.findFirst({
      where: {
        resource: createPermissionDto.resource,
        action: createPermissionDto.action,
      },
    });

    if (existingCombo) {
      throw new ConflictException(
        `Ya existe un permiso para ${createPermissionDto.resource}.${createPermissionDto.action}`,
      );
    }

    return this.prisma.permission.create({
      data: createPermissionDto,
    });
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      include: {
        rolePermissions: true,
      },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findPermissionsByRole(role: UserRole) {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role },
      include: {
        permission: true,
      },
    });

    return rolePermissions.map((rp) => ({
      ...rp.permission,
      conditions: rp.conditions,
    }));
  }

  // ============ Asignación de Permisos a Roles ============

  async assignPermissionToRole(assignPermissionDto: AssignPermissionDto) {
    const { role, permissionId, conditions } = assignPermissionDto;

    // Verificar que el permiso existe
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException(`Permiso con ID ${permissionId} no encontrado`);
    }

    // Verificar si ya está asignado
    const existing = await this.prisma.rolePermission.findUnique({
      where: {
        role_permissionId: {
          role,
          permissionId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `El permiso "${permission.name}" ya está asignado al rol ${role}`,
      );
    }

    return this.prisma.rolePermission.create({
      data: {
        role,
        permissionId,
        conditions,
      },
      include: {
        permission: true,
      },
    });
  }

  async removePermissionFromRole(role: UserRole, permissionId: number) {
    const rolePermission = await this.prisma.rolePermission.findUnique({
      where: {
        role_permissionId: {
          role,
          permissionId,
        },
      },
    });

    if (!rolePermission) {
      throw new NotFoundException(
        `El permiso no está asignado a este rol`,
      );
    }

    await this.prisma.rolePermission.delete({
      where: {
        role_permissionId: {
          role,
          permissionId,
        },
      },
    });

    return {
      message: 'Permiso removido del rol exitosamente',
    };
  }

  // ============ Permisos Específicos de Documentos ============

  async grantDocumentPermission(
    documentId: number,
    grantedById: string,
    grantDto: GrantDocumentPermissionDto,
  ) {
    const { userId, role, departmentId, ...permissions } = grantDto;

    // Validar que al menos uno esté presente
    if (!userId && !role && !departmentId) {
      throw new BadRequestException(
        'Debe proporcionar al menos userId, role o departmentId',
      );
    }

    // Verificar que el documento existe
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Documento con ID ${documentId} no encontrado`);
    }

    // Verificar que el usuario que otorga el permiso existe
    const grantedBy = await this.prisma.user.findUnique({
      where: { id: grantedById },
    });

    if (!grantedBy) {
      throw new NotFoundException(`Usuario con ID ${grantedById} no encontrado`);
    }

    // Si se especifica userId, verificar que existe
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
      }
    }

    // Si se especifica departmentId, verificar que existe
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
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        grantedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    return {
      message: 'Permiso de documento revocado exitosamente',
    };
  }

  async getDocumentPermissions(documentId: number) {
    return this.prisma.documentPermission.findMany({
      where: { documentId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        grantedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  // ============ Verificación de Permisos ============

  async checkUserHasPermission(
    userId: string,
    permissionName: string,
  ): Promise<boolean> {
    // Obtener usuario con su rol y departamento
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return false;
    }

    // ADMIN siempre tiene todos los permisos
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Buscar permiso por nombre
    const permission = await this.prisma.permission.findUnique({
      where: { name: permissionName },
    });

    if (!permission) {
      return false;
    }

    // Verificar si el rol del usuario tiene ese permiso
    const rolePermission = await this.prisma.rolePermission.findUnique({
      where: {
        role_permissionId: {
          role: user.role,
          permissionId: permission.id,
        },
      },
    });

    return !!rolePermission;
  }

  async checkDocumentPermission(
    userId: string,
    documentId: number,
    action: 'view' | 'edit' | 'delete' | 'share',
  ): Promise<boolean> {
    // Obtener usuario con departamento
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return false;
    }

    // ADMIN y DIRECTOR tienen acceso completo
    if (user.role === UserRole.ADMIN || user.role === UserRole.DIRECTOR) {
      return true;
    }

    // Verificar si el documento existe
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return false;
    }

    // Si el usuario es el dueño del documento, tiene todos los permisos
    if (document.uploadedById === userId) {
      return true;
    }

    // Buscar permisos específicos del documento
    const permissions = await this.prisma.documentPermission.findMany({
      where: {
        documentId,
        OR: [
          { userId }, // Permiso directo al usuario
          { role: user.role }, // Permiso por rol
          { departmentId: user.departmentId || undefined }, // Permiso por departamento
        ],
        // Verificar que no haya expirado
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
          },
        ],
      },
    });

    // Verificar si algún permiso otorga la acción solicitada
    const actionMap = {
      view: 'canView',
      edit: 'canEdit',
      delete: 'canDelete',
      share: 'canShare',
    };

    return permissions.some((p) => p[actionMap[action]] === true);
  }

  // ============ Herencia de Permisos por Jerarquía ============

  hasHigherRole(userRole: UserRole, targetRole: UserRole): boolean {
    return this.roleHierarchy[userRole] > this.roleHierarchy[targetRole];
  }
}
