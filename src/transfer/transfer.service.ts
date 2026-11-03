import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, AuditResource, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  notifyTransferCanceled,
  notifyTransferCompleted,
  notifyTransferRequested,
  transferComment,
} from './transfer-notification';

const transferInclude = {
  document: {
    select: {
      id: true,
      name: true,
      description: true,
      uploadedById: true,
      category: { select: { id: true, name: true, color: true } },
      documentType: { select: { id: true, name: true } },
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { filename: true, mimetype: true, size: true },
      },
    },
  },
  fromUser: { select: { id: true, name: true, email: true } },
  toUser: { select: { id: true, name: true, email: true, isActive: true } },
  initiatedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TransferHistoryInclude;

const activeChangeRequestStatuses = [
  'PENDING',
  'IN_PROGRESS',
  'CORRECTION_SUBMITTED',
] as const;

@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTransferDto, actorId: string) {
    return this.createInternal(dto, actorId, false);
  }

  async createForOwner(dto: CreateTransferDto, adminId: string) {
    return this.createInternal(dto, adminId, true);
  }

  private async createInternal(
    dto: CreateTransferDto,
    actorId: string,
    adminOverride: boolean,
  ) {
    const comment = transferComment(dto.comment);

    return this.serializable(async (tx) => {
      const document = await this.loadTransferableDocument(tx, dto.documentId);

      if (!adminOverride && document.uploadedById !== actorId) {
        throw new ForbiddenException(
          'No tienes permiso para transferir este documento',
        );
      }

      const recipient = await tx.user.findUnique({
        where: { id: dto.toUserId },
        select: { id: true, name: true, email: true, isActive: true },
      });
      if (!recipient) {
        throw new NotFoundException('Usuario destinatario no encontrado');
      }
      if (!recipient.isActive) {
        throw new ConflictException(
          'El usuario destinatario está desactivado',
        );
      }
      if (recipient.id === document.uploadedById) {
        throw new BadRequestException(
          'El documento ya pertenece a ese usuario',
        );
      }

      const pending = await tx.transferHistory.findFirst({
        where: { documentId: document.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException(
          'Ya existe una transferencia pendiente para este documento',
        );
      }

      const fromUser = await tx.user.findUnique({
        where: { id: document.uploadedById },
        select: { id: true, name: true, email: true },
      });
      if (!fromUser) {
        throw new ConflictException('El propietario actual ya no existe');
      }

      const transfer = await tx.transferHistory.create({
        data: {
          documentId: document.id,
          fromUserId: document.uploadedById,
          toUserId: recipient.id,
          initiatedById: actorId,
          comment,
        },
        include: transferInclude,
      });

      const documentName = this.documentName(document);
      await notifyTransferRequested(tx, {
        documentId: document.id,
        documentName,
        fromName: fromUser.name?.trim() || fromUser.email,
        toUserId: recipient.id,
        comment,
      });
      await this.audit.record(
        {
          action: AuditAction.REASSIGN,
          resource: AuditResource.DOCUMENT,
          resourceId: String(document.id),
          documentId: document.id,
          metadata: {
            transferId: transfer.id,
            status: 'PENDING',
            fromUserId: document.uploadedById,
            toUserId: recipient.id,
            initiatedById: actorId,
          },
        },
        tx,
      );

      return transfer;
    });
  }

  async accept(id: number, actorId: string) {
    return this.serializable(async (tx) => {
      const transfer = await tx.transferHistory.findUnique({
        where: { id },
        select: {
          id: true,
          documentId: true,
          fromUserId: true,
          toUserId: true,
          initiatedById: true,
          status: true,
        },
      });
      if (!transfer) throw new NotFoundException('Transferencia no encontrada');
      if (transfer.status !== 'PENDING') {
        throw new ConflictException(
          'La transferencia ya no está pendiente',
        );
      }
      if (transfer.toUserId !== actorId) {
        throw new ForbiddenException(
          'Solo el destinatario puede aceptar la transferencia',
        );
      }

      const recipient = await tx.user.findUnique({
        where: { id: actorId },
        select: { id: true, name: true, email: true, isActive: true },
      });
      if (!recipient?.isActive) {
        throw new ConflictException(
          'El usuario destinatario está desactivado',
        );
      }

      const document = await this.loadTransferableDocument(tx, transfer.documentId);
      if (document.uploadedById !== transfer.fromUserId) {
        throw new ConflictException(
          'La propiedad del documento cambió; la solicitud ya no es válida',
        );
      }
      if (document.uploadedById === actorId) {
        throw new ConflictException('El documento ya pertenece al destinatario');
      }

      await tx.document.update({
        where: { id: document.id },
        data: { uploadedById: actorId },
      });

      const completed = await tx.transferHistory.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: transferInclude,
      });

      await notifyTransferCompleted(tx, {
        documentId: document.id,
        documentName: this.documentName(document),
        fromUserId: transfer.fromUserId,
        toName: recipient.name?.trim() || recipient.email,
      });
      await this.audit.record(
        {
          action: AuditAction.REASSIGN,
          resource: AuditResource.DOCUMENT,
          resourceId: String(document.id),
          documentId: document.id,
          metadata: {
            transferId: id,
            status: 'COMPLETED',
            fromUserId: transfer.fromUserId,
            toUserId: actorId,
            initiatedById: transfer.initiatedById,
          },
        },
        tx,
      );

      return completed;
    });
  }

  async cancel(id: number, actorId: string) {
    return this.serializable(async (tx) => {
      const transfer = await tx.transferHistory.findUnique({
        where: { id },
        select: {
          id: true,
          documentId: true,
          fromUserId: true,
          toUserId: true,
          initiatedById: true,
          status: true,
        },
      });
      if (!transfer) throw new NotFoundException('Transferencia no encontrada');
      if (transfer.status !== 'PENDING') {
        throw new ConflictException(
          'La transferencia ya no está pendiente',
        );
      }

      const authorized = [
        transfer.fromUserId,
        transfer.toUserId,
        transfer.initiatedById,
      ].includes(actorId);
      if (!authorized) {
        throw new ForbiddenException(
          'No tienes permiso para cancelar esta transferencia',
        );
      }

      const canceled = await tx.transferHistory.update({
        where: { id },
        data: { status: 'CANCELED', canceledAt: new Date() },
        include: transferInclude,
      });

      const documentName =
        canceled.document.name?.trim() ||
        canceled.document.versions?.[0]?.filename ||
        'Documento';
      const canceledByRecipient = transfer.toUserId === actorId;
      const notificationUserIds = canceledByRecipient
        ? [transfer.fromUserId, transfer.initiatedById ?? '']
        : [transfer.toUserId ?? ''];

      await notifyTransferCanceled(tx, {
        documentId: transfer.documentId,
        documentName,
        userIds: notificationUserIds,
        canceledByRecipient,
      });
      await this.audit.record(
        {
          action: AuditAction.CANCEL,
          resource: AuditResource.DOCUMENT,
          resourceId: String(transfer.documentId),
          documentId: transfer.documentId,
          metadata: {
            transferId: id,
            status: 'CANCELED',
            fromUserId: transfer.fromUserId,
            toUserId: transfer.toUserId,
            initiatedById: transfer.initiatedById,
            canceledBy: actorId,
          },
        },
        tx,
      );

      return canceled;
    });
  }

  async getSent(userId: string) {
    return this.prisma.transferHistory.findMany({
      where: {
        OR: [{ fromUserId: userId }, { initiatedById: userId }],
      },
      include: transferInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getReceived(userId: string) {
    return this.prisma.transferHistory.findMany({
      where: { toUserId: userId },
      include: transferInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getStats(userId: string) {
    const involvement = {
      OR: [
        { fromUserId: userId },
        { toUserId: userId },
        { initiatedById: userId },
      ],
    };
    const [sent, received, total, pending] = await Promise.all([
      this.prisma.transferHistory.count({
        where: { OR: [{ fromUserId: userId }, { initiatedById: userId }] },
      }),
      this.prisma.transferHistory.count({ where: { toUserId: userId } }),
      this.prisma.transferHistory.count({ where: involvement }),
      this.prisma.transferHistory.count({
        where: { ...involvement, status: 'PENDING' },
      }),
    ]);

    return { sent, received, total, pending };
  }

  async findOne(id: number, userId: string) {
    const transfer = await this.prisma.transferHistory.findUnique({
      where: { id },
      include: transferInclude,
    });
    if (!transfer) throw new NotFoundException('Transferencia no encontrada');

    const authorized = [
      transfer.fromUserId,
      transfer.toUserId,
      transfer.initiatedById,
    ].includes(userId);
    if (!authorized) {
      throw new ForbiddenException(
        'No tienes permiso para ver esta transferencia',
      );
    }

    return transfer;
  }

  private async loadTransferableDocument(
    db: Prisma.TransactionClient,
    documentId: number,
  ) {
    const document = await db.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        name: true,
        uploadedById: true,
        deletedAt: true,
        archivedAt: true,
        receptionOriginDirectoryId: true,
        directory: { select: { receptionEnabled: true } },
        workflow: { where: { active: true }, select: { id: true }, take: 1 },
        changeRequests: {
          where: { status: { in: [...activeChangeRequestStatuses] } },
          select: { id: true },
          take: 1,
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { filename: true },
        },
      },
    });

    if (!document) throw new NotFoundException('Documento no encontrado');
    if (document.deletedAt) {
      throw new ConflictException('El documento está eliminado');
    }
    if (document.archivedAt) {
      throw new ConflictException('El documento está archivado');
    }
    if (
      document.receptionOriginDirectoryId !== null ||
      document.directory?.receptionEnabled === true
    ) {
      throw new ConflictException(
        'Los documentos de recepción no se pueden transferir en esta fase',
      );
    }
    if (document.workflow.length > 0) {
      throw new ConflictException(
        'El documento tiene un workflow activo; resuélvelo antes de transferirlo',
      );
    }
    if (document.changeRequests.length > 0) {
      throw new ConflictException(
        'El documento tiene una solicitud de cambios activa',
      );
    }

    return document;
  }

  private documentName(document: {
    name: string | null;
    versions: { filename: string }[];
  }): string {
    return document.name?.trim() || document.versions[0]?.filename || 'Documento';
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'Ya existe una transferencia pendiente para este documento',
        );
      }
      if (error?.code === 'P2034') {
        throw new ConflictException(
          'La transferencia cambió mientras se procesaba; intenta de nuevo',
        );
      }
      throw error;
    }
  }
}
