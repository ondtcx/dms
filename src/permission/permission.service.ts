import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';

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
}
