import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShareDto } from './dto/create-share.dto';
import { AccessShareDto } from './dto/access-share.dto';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';

@Injectable()
export class ShareService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crear un nuevo share de documento
   */
  async create(createShareDto: CreateShareDto, sharedById: string) {
    // Verificar que el documento existe
    const document = await this.prisma.document.findUnique({
      where: { id: createShareDto.documentId },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${createShareDto.documentId} no encontrado`,
      );
    }

    // Verificar que el usuario tiene permisos para compartir
    if (document.uploadedById !== sharedById) {
      // Verificar si tiene permiso de compartir
      const hasPermission = await this.prisma.documentPermission.findFirst({
        where: {
          documentId: createShareDto.documentId,
          OR: [{ userId: sharedById }],
          canShare: true,
        },
      });

      if (!hasPermission) {
        throw new ForbiddenException(
          'No tienes permiso para compartir este documento',
        );
      }
    }

    // Resolver email → ID si el userId contiene '@'
    let resolvedUserId = createShareDto.userId;
    if (resolvedUserId?.includes('@')) {
      const targetUser = await this.prisma.user.findUnique({
        where: { email: resolvedUserId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new NotFoundException(
          `Usuario con email ${resolvedUserId} no encontrado`,
        );
      }
      resolvedUserId = targetUser.id;
    }

    // Generar token único
    const shareToken = randomUUID();

    // Hash de contraseña si se proporciona
    let hashedPassword: string | undefined;
    if (createShareDto.requiresPassword && createShareDto.password) {
      hashedPassword = await bcrypt.hash(createShareDto.password, 10);
    }

    // Crear el share
    const share = await this.prisma.documentShare.create({
      data: {
        documentId: createShareDto.documentId,
        userId: resolvedUserId,
        role: createShareDto.role,
        departmentId: createShareDto.departmentId,
        courseId: createShareDto.courseId,
        canView: createShareDto.canView ?? true,
        canDownload: createShareDto.canDownload ?? true,
        canEdit: createShareDto.canEdit ?? false,
        canShare: createShareDto.canShare ?? false,
        isPublicLink: createShareDto.isPublicLink ?? false,
        shareToken,
        requiresPassword: createShareDto.requiresPassword ?? false,
        password: hashedPassword,
        expiresAt: createShareDto.expiresAt
          ? new Date(createShareDto.expiresAt)
          : null,
        maxViews: createShareDto.maxViews,
        sharedById,
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            uploadedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
        department: {
          select: { id: true, name: true },
        },
        course: {
          select: { id: true, name: true, code: true },
        },
        sharedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return share;
  }

  /**
   * Obtener todos los shares de un usuario (shares recibidos)
   */
  async getReceivedShares(userId: string) {
    // Obtener rol, departamento y cursos del usuario para filtrar shares por esas dimensiones
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        departmentId: true,
        courses: { select: { courseId: true } },
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado');

    const orConditions: any[] = [
      { userId }, // Share directo al usuario
      { role: user.role }, // Share al rol del usuario
    ];

    if (user.departmentId) {
      orConditions.push({ departmentId: user.departmentId });
    }

    const courseIds = user.courses.map((c) => c.courseId);
    if (courseIds.length > 0) {
      orConditions.push({ courseId: { in: courseIds } });
    }

    const shares = await this.prisma.documentShare.findMany({
      where: {
        OR: orConditions,
        revokedAt: null,
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
        ],
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
            size: true,
            createdAt: true,
          },
        },
        sharedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares;
  }

  /**
   * Obtener todos los shares creados por un usuario
   */
  async getSentShares(userId: string) {
    const shares = await this.prisma.documentShare.findMany({
      where: {
        sharedById: userId,
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
            size: true,
          },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
        department: {
          select: { id: true, name: true },
        },
        course: {
          select: { id: true, name: true, code: true },
        },
        accesses: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares;
  }

  /**
   * Obtener shares de un documento específico
   */
  async getDocumentShares(documentId: number, userId: string) {
    // Verificar que el usuario tiene permiso para ver los shares
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado`,
      );
    }

    if (document.uploadedById !== userId) {
      // Verificar permisos
      const hasPermission = await this.prisma.documentPermission.findFirst({
        where: {
          documentId,
          OR: [{ userId }],
          canShare: true,
        },
      });

      if (!hasPermission) {
        throw new ForbiddenException(
          'No tienes permiso para ver los shares de este documento',
        );
      }
    }

    const shares = await this.prisma.documentShare.findMany({
      where: { documentId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        department: {
          select: { id: true, name: true },
        },
        course: {
          select: { id: true, name: true, code: true },
        },
        sharedBy: {
          select: { id: true, name: true, email: true },
        },
        revokedBy: {
          select: { id: true, name: true, email: true },
        },
        accesses: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return shares;
  }

  /**
   * Acceder a un share por token
   */
  async accessByToken(
    shareToken: string,
    accessDto: AccessShareDto,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const share = await this.prisma.documentShare.findUnique({
      where: { shareToken },
      include: {
        document: true,
      },
    });

    if (!share) {
      throw new NotFoundException('Share no encontrado');
    }

    // Verificar que no está revocado
    if (share.revokedAt) {
      throw new ForbiddenException('Este share ha sido revocado');
    }

    // Verificar expiración
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new ForbiddenException('Este share ha expirado');
    }

    // Verificar límite de vistas
    if (share.maxViews && share.viewCount >= share.maxViews) {
      throw new ForbiddenException(
        'Se alcanzó el límite de vistas para este share',
      );
    }

    // Verificar contraseña si se requiere
    if (share.requiresPassword && share.password) {
      if (!accessDto.password) {
        throw new BadRequestException(
          'Se requiere contraseña para acceder a este share',
        );
      }

      const isPasswordValid = await bcrypt.compare(
        accessDto.password,
        share.password,
      );
      if (!isPasswordValid) {
        throw new ForbiddenException('Contraseña incorrecta');
      }
    }

    // Registrar acceso
    await this.prisma.shareAccess.create({
      data: {
        shareId: share.id,
        userId: userId || null,
        action: 'VIEW',
        ipAddress,
        userAgent,
      },
    });

    // Incrementar contador de vistas
    await this.prisma.documentShare.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } },
    });

    return share;
  }

  /**
   * Revocar un share
   */
  async revoke(shareId: number, userId: string) {
    const share = await this.prisma.documentShare.findUnique({
      where: { id: shareId },
    });

    if (!share) {
      throw new NotFoundException(`Share con ID ${shareId} no encontrado`);
    }

    // Verificar que el usuario tiene permiso para revocar
    if (share.sharedById !== userId) {
      // Verificar si es el dueño del documento
      const document = await this.prisma.document.findUnique({
        where: { id: share.documentId },
      });

      if (document?.uploadedById !== userId) {
        throw new ForbiddenException(
          'No tienes permiso para revocar este share',
        );
      }
    }

    // Revocar el share
    const revokedShare = await this.prisma.documentShare.update({
      where: { id: shareId },
      data: {
        revokedAt: new Date(),
        revokedById: userId,
      },
    });

    return revokedShare;
  }

  /**
   * Eliminar un share
   */
  async delete(shareId: number, userId: string) {
    const share = await this.prisma.documentShare.findUnique({
      where: { id: shareId },
    });

    if (!share) {
      throw new NotFoundException(`Share con ID ${shareId} no encontrado`);
    }

    // Verificar que el usuario tiene permiso para eliminar
    if (share.sharedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este share',
      );
    }

    await this.prisma.documentShare.delete({
      where: { id: shareId },
    });

    return { message: 'Share eliminado correctamente' };
  }
}
