import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransferService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  private readonly transferInclude = {
    document: {
      select: {
        id: true,
        filename: true,
        mimetype: true,
        size: true,
        description: true,
        category: { select: { id: true, name: true, color: true } },
        section: { select: { id: true, name: true, color: true } },
      },
    },
    fromUser: {
      select: {
        id: true,
        name: true,
        email: true,
        department: { select: { id: true, name: true } },
      },
    },
    toUser: {
      select: {
        id: true,
        name: true,
        email: true,
        department: { select: { id: true, name: true } },
      },
    },
    toDepartment: {
      select: { id: true, name: true },
    },
  };

  /**
   * Crea una nueva transferencia de documento
   */
  async create(createTransferDto: CreateTransferDto, fromUserId: string) {
    const { documentId, toUserId, toDepartmentId, comment } = createTransferDto;

    // Validar que se proporcionó al menos un destinatario
    if (!toUserId && !toDepartmentId) {
      throw new BadRequestException(
        'Debes proporcionar un usuario o un departamento destinatario',
      );
    }

    // No se puede transferir a uno mismo
    if (toUserId && fromUserId === toUserId) {
      throw new BadRequestException(
        'No puedes transferir un documento a ti mismo',
      );
    }

    // Verificar que el documento existe y no está eliminado
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado`,
      );
    }

    // Verificar que el usuario es dueño del documento, tiene permisos, o recibió el documento por transferencia
    if (document.uploadedById !== fromUserId) {
      const hasPermission = await this.prisma.documentPermission.findFirst({
        where: {
          documentId,
          userId: fromUserId,
          canShare: true,
        },
      });

      // Verificar si tiene transferencia completada del documento
      const hasTransfer = await this.prisma.transferHistory.findFirst({
        where: {
          documentId,
          toUserId: fromUserId,
          status: 'COMPLETED',
        },
      });

      if (!hasPermission && !hasTransfer) {
        throw new ForbiddenException(
          'No tienes permiso para transferir este documento',
        );
      }
    }

    // Verificar que el usuario destinatario existe
    if (toUserId) {
      const toUser = await this.prisma.user.findUnique({
        where: { id: toUserId },
      });

      if (!toUser) {
        throw new NotFoundException(
          `Usuario destinatario con ID ${toUserId} no encontrado`,
        );
      }
    }

    // Verificar que el departamento existe
    if (toDepartmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: toDepartmentId },
      });

      if (!department) {
        throw new NotFoundException(
          `Departamento con ID ${toDepartmentId} no encontrado`,
        );
      }
    }

    // Verificar que no exista una transferencia pendiente del mismo documento al mismo destinatario
    const existingWhere: any = {
      documentId,
      status: 'PENDING',
    };

    if (toUserId) {
      existingWhere.toUserId = toUserId;
    } else {
      existingWhere.toDepartmentId = toDepartmentId;
      existingWhere.toUserId = null;
    }

    const existingTransfer = await this.prisma.transferHistory.findFirst({
      where: existingWhere,
    });

    if (existingTransfer) {
      throw new BadRequestException(
        'Ya existe una transferencia pendiente de este documento para el mismo destinatario',
      );
    }

    const transfer = await this.prisma.transferHistory.create({
      data: {
        documentId,
        fromUserId,
        toUserId: toUserId || null,
        toDepartmentId: toDepartmentId || null,
        comment: comment || null,
      },
      include: this.transferInclude,
    });

    // Notificar al destinatario de la transferencia
    const fromUserName = transfer.fromUser.name || transfer.fromUser.email;
    const documentName = transfer.document.filename;

    if (toUserId) {
      await this.notificationService.notifyDocumentTransferred(
        documentId,
        toUserId,
        fromUserName,
        documentName,
      );
    } else if (toDepartmentId) {
      await this.notificationService.notifyDocumentTransferredToDepartment(
        documentId,
        toDepartmentId,
        fromUserId,
        fromUserName,
        documentName,
      );
    }

    return transfer;
  }

  /**
   * Obtiene las transferencias enviadas por el usuario
   */
  async getSent(userId: string) {
    return this.prisma.transferHistory.findMany({
      where: { fromUserId: userId },
      include: this.transferInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtiene las transferencias recibidas por el usuario
   * Incluye transferencias directas y las dirigidas a su departamento
   */
  async getReceived(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });

    const orConditions: any[] = [{ toUserId: userId }];

    if (user?.departmentId) {
      orConditions.push({
        toDepartmentId: user.departmentId,
        toUserId: null,
      });
    }

    return this.prisma.transferHistory.findMany({
      where: { OR: orConditions },
      include: this.transferInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Obtiene una transferencia por ID
   */
  async findOne(id: number, userId: string) {
    const transfer = await this.prisma.transferHistory.findUnique({
      where: { id },
      include: this.transferInclude,
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con ID ${id} no encontrada`);
    }

    // Solo el remitente o el destinatario pueden ver la transferencia
    const isFromUser = transfer.fromUserId === userId;
    const isToUser = transfer.toUserId === userId;
    let isDepartmentMember = false;

    if (!isFromUser && !isToUser && transfer.toDepartmentId && !transfer.toUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      isDepartmentMember = user?.departmentId === transfer.toDepartmentId;
    }

    if (!isFromUser && !isToUser && !isDepartmentMember) {
      throw new ForbiddenException(
        'No tienes permiso para ver esta transferencia',
      );
    }

    return transfer;
  }

  /**
   * Acepta (completa) una transferencia
   */
  async complete(id: number, userId: string) {
    const transfer = await this.prisma.transferHistory.findUnique({
      where: { id },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con ID ${id} no encontrada`);
    }

    // Verificar si el usuario puede aceptar la transferencia
    const isDirectRecipient = transfer.toUserId === userId;
    let isDepartmentMember = false;

    if (!isDirectRecipient && transfer.toDepartmentId && !transfer.toUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      isDepartmentMember = user?.departmentId === transfer.toDepartmentId;
    }

    if (!isDirectRecipient && !isDepartmentMember) {
      throw new ForbiddenException(
        'Solo el destinatario puede aceptar la transferencia',
      );
    }

    if (transfer.status !== 'PENDING') {
      throw new BadRequestException(
        `No se puede aceptar una transferencia con estado ${transfer.status}`,
      );
    }

    // Actualizar transferencia
    const [updatedTransfer] = await this.prisma.$transaction([
      this.prisma.transferHistory.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          ...(isDepartmentMember && !transfer.toUserId ? { toUserId: userId } : {}),
        },
        include: this.transferInclude,
      }),
    ]);

    return updatedTransfer;
  }

  /**
   * Cancela una transferencia
   */
  async cancel(id: number, userId: string) {
    const transfer = await this.prisma.transferHistory.findUnique({
      where: { id },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con ID ${id} no encontrada`);
    }

    // Solo el remitente o el destinatario pueden cancelar
    const isFromUser = transfer.fromUserId === userId;
    const isToUser = transfer.toUserId === userId;
    let canCancel = isFromUser || isToUser;

    if (!canCancel && transfer.toDepartmentId && !transfer.toUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      canCancel = user?.departmentId === transfer.toDepartmentId;
    }

    if (!canCancel) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar esta transferencia',
      );
    }

    if (transfer.status !== 'PENDING') {
      throw new BadRequestException(
        `No se puede cancelar una transferencia con estado ${transfer.status}`,
      );
    }

    return this.prisma.transferHistory.update({
      where: { id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
      include: this.transferInclude,
    });
  }

  /**
   * Obtiene estadísticas de transferencias del usuario
   */
  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });

    const receivedConditions: any[] = [{ toUserId: userId }];
    if (user?.departmentId) {
      receivedConditions.push({
        toDepartmentId: user.departmentId,
        toUserId: null,
      });
    }

    const [sent, received, pending] = await Promise.all([
      this.prisma.transferHistory.count({ where: { fromUserId: userId } }),
      this.prisma.transferHistory.count({ where: { OR: receivedConditions } }),
      this.prisma.transferHistory.count({
        where: {
          OR: [{ fromUserId: userId }, ...receivedConditions],
          status: 'PENDING',
        },
      }),
    ]);

    return {
      sent,
      received,
      total: sent + received,
      pending,
    };
  }

  /**
   * Obtiene historial de transferencias de un documento
   */
  async getDocumentTransfers(documentId: number, userId: string) {
    // Verificar que el documento existe
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException(
        `Documento con ID ${documentId} no encontrado`,
      );
    }

    return this.prisma.transferHistory.findMany({
      where: { documentId },
      include: this.transferInclude,
      orderBy: { createdAt: 'desc' },
    });
  }
}
