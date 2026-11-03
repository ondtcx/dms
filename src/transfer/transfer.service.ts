import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditAction, AuditResource, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import {
  CreateBulkAdminTransferDto,
  CreateBulkTransferDto,
} from './dto/create-bulk-transfer.dto';
import {
  notifyTransferBatchCanceled,
  notifyTransferBatchCompleted,
  notifyTransferBatchRequested,
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

  async createBulk(dto: CreateBulkTransferDto, actorId: string) {
    return this.createBulkInternal(
      {
        documentIds: dto.documentIds,
        toUserId: dto.toUserId,
        comment: dto.comment,
      },
      actorId,
      false,
    );
  }

  async createBulkForOwner(dto: CreateBulkAdminTransferDto, adminId: string) {
    return this.createBulkInternal(
      {
        fromOwnerId: dto.fromOwnerId,
        documentIds: dto.documentIds,
        toUserId: dto.toUserId,
        comment: dto.comment,
      },
      adminId,
      true,
    );
  }

  private async createBulkInternal(
    input: {
      fromOwnerId?: string;
      documentIds?: number[];
      toUserId: string;
      comment?: string;
    },
    actorId: string,
    adminOverride: boolean,
  ) {
    const ownerId = adminOverride ? input.fromOwnerId : actorId;
    if (!ownerId) {
      throw new BadRequestException('Selecciona el propietario de los documentos');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: input.toUserId },
      select: { id: true, isActive: true },
    });
    if (!recipient) {
      throw new NotFoundException('Usuario destinatario no encontrado');
    }
    if (!recipient.isActive) {
      throw new ConflictException('El usuario destinatario está desactivado');
    }
    if (recipient.id === ownerId) {
      throw new BadRequestException(
        'No puedes transferir documentos al mismo propietario',
      );
    }

    const requestedIds = input.documentIds
      ? [...new Set(input.documentIds)]
      : null;
    let documentIds: number[];
    const skipped: { documentId: number; reason: string }[] = [];

    if (requestedIds) {
      const owned = await this.prisma.document.findMany({
        where: { id: { in: requestedIds }, uploadedById: ownerId },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((document) => document.id));
      documentIds = requestedIds.filter((id) => ownedIds.has(id));
      for (const id of requestedIds) {
        if (!ownedIds.has(id)) {
          skipped.push({
            documentId: id,
            reason: 'El documento no existe o no pertenece al propietario',
          });
        }
      }
    } else {
      if (!adminOverride) {
        throw new BadRequestException('Selecciona al menos un documento');
      }
      const owned = await this.prisma.document.findMany({
        where: { uploadedById: ownerId },
        select: { id: true },
        take: 501,
      });
      if (owned.length > 500) {
        throw new ConflictException(
          'El usuario tiene más de 500 documentos; divide la transferencia en lotes',
        );
      }
      documentIds = owned.map((document) => document.id);
      if (!documentIds.length) {
        throw new ConflictException(
          'El propietario no tiene documentos para transferir',
        );
      }
    }

    const batchId = randomUUID();
    const created: any[] = [];
    for (const documentId of documentIds) {
      try {
        created.push(
          await this.createInternal(
            { documentId, toUserId: input.toUserId, comment: input.comment },
            actorId,
            adminOverride,
            { batchId, notify: false, expectedOwnerId: ownerId },
          ),
        );
      } catch (error) {
        skipped.push({
          documentId,
          reason: this.failureReason(error),
        });
      }
    }

    if (created.length > 0) {
      const fromName =
        created[0].fromUser?.name?.trim() ||
        created[0].fromUser?.email ||
        'El propietario';
      try {
        await notifyTransferBatchRequested(this.prisma, {
          fromName,
          toUserId: input.toUserId,
          documentCount: created.length,
          comment: transferComment(input.comment),
        });
      } catch {
        // The batch is already persisted; notification delivery is best-effort.
      }
    }

    return {
      batchId,
      created,
      skipped,
      summary: {
        total: requestedIds ? requestedIds.length : documentIds.length,
        created: created.length,
        skipped: skipped.length,
      },
    };
  }

  async acceptBatch(batchId: string, actorId: string) {
    const pending = await this.prisma.transferHistory.findMany({
      where: { batchId, toUserId: actorId, status: 'PENDING' },
      select: {
        id: true,
        documentId: true,
        fromUserId: true,
      },
      orderBy: { id: 'asc' },
    });
    if (!pending.length) {
      throw new NotFoundException(
        'No hay transferencias pendientes en este lote',
      );
    }

    let accepted = 0;
    const failed: {
      transferId: number;
      documentId: number;
      reason: string;
    }[] = [];
    for (const item of pending) {
      try {
        await this.acceptInternal(item.id, actorId, { notify: false });
        accepted += 1;
      } catch (error) {
        failed.push({
          transferId: item.id,
          documentId: item.documentId,
          reason: this.failureReason(error),
        });
      }
    }

    if (accepted > 0) {
      const fromUserIds = [...new Set(pending.map((item) => item.fromUserId))];
      for (const fromUserId of fromUserIds) {
        try {
          await notifyTransferBatchCompleted(this.prisma, {
            fromUserId,
            documentCount: pending.length,
            acceptedCount: accepted,
            failedCount: failed.length,
          });
        } catch {
          // Notification delivery must not hide the persisted ownership changes.
        }
      }
    }

    return { batchId, accepted, failed };
  }

  async cancelBatch(batchId: string, actorId: string) {
    const pending = await this.prisma.transferHistory.findMany({
      where: { batchId, status: 'PENDING' },
      select: {
        id: true,
        documentId: true,
        fromUserId: true,
        toUserId: true,
        initiatedById: true,
      },
      orderBy: { id: 'asc' },
    });
    if (!pending.length) {
      throw new NotFoundException(
        'No hay transferencias pendientes en este lote',
      );
    }

    const authorized = pending.some((item) =>
      [item.fromUserId, item.toUserId, item.initiatedById].includes(actorId),
    );
    if (!authorized) {
      throw new ForbiddenException(
        'No tienes permiso para cancelar este lote',
      );
    }

    let canceled = 0;
    const failed: {
      transferId: number;
      documentId: number;
      reason: string;
    }[] = [];
    for (const item of pending) {
      try {
        await this.cancelInternal(item.id, actorId, { notify: false });
        canceled += 1;
      } catch (error) {
        failed.push({
          transferId: item.id,
          documentId: item.documentId,
          reason: this.failureReason(error),
        });
      }
    }

    if (canceled > 0) {
      const first = pending[0];
      const canceledByRecipient = first.toUserId === actorId;
      const userIds = canceledByRecipient
        ? [first.fromUserId, first.initiatedById ?? '']
        : [first.toUserId ?? ''];
      try {
        await notifyTransferBatchCanceled(this.prisma, {
          documentCount: canceled,
          userIds,
          canceledByRecipient,
        });
      } catch {
        // Notification delivery must not hide the persisted cancellations.
      }
    }

    return { batchId, canceled, failed };
  }

  private failureReason(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object') {
        const message = (response as { message?: unknown }).message;
        if (Array.isArray(message)) return message.join('. ');
        if (message !== undefined) return String(message);
      }
      return error.message;
    }
    return error instanceof Error ? error.message : 'No se pudo procesar el documento';
  }

  private async createInternal(
    dto: CreateTransferDto,
    actorId: string,
    adminOverride: boolean,
    options: {
      batchId?: string;
      notify?: boolean;
      expectedOwnerId?: string;
    } = {},
  ) {
    const comment = transferComment(dto.comment);

    return this.serializable(async (tx) => {
      const document = await this.loadTransferableDocument(tx, dto.documentId);

      if (options.expectedOwnerId && document.uploadedById !== options.expectedOwnerId) {
        throw new ConflictException(
          'La propiedad del documento cambió; la solicitud ya no es válida',
        );
      }
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
          batchId: options.batchId ?? null,
          comment,
        },
        include: transferInclude,
      });

      const documentName = this.documentName(document);
      if (options.notify !== false) {
        await notifyTransferRequested(tx, {
          documentId: document.id,
          documentName,
          fromName: fromUser.name?.trim() || fromUser.email,
          toUserId: recipient.id,
          comment,
        });
      }
      await this.audit.record(
        {
          action: AuditAction.REASSIGN,
          resource: AuditResource.DOCUMENT,
          resourceId: String(document.id),
          documentId: document.id,
          metadata: {
            transferId: transfer.id,
            ...(options.batchId ? { batchId: options.batchId } : {}),
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
    return this.acceptInternal(id, actorId);
  }

  private async acceptInternal(
    id: number,
    actorId: string,
    options: { notify?: boolean } = {},
  ) {
    return this.serializable(async (tx) => {
      const transfer = await tx.transferHistory.findUnique({
        where: { id },
        select: {
          id: true,
          documentId: true,
          fromUserId: true,
          toUserId: true,
          initiatedById: true,
          batchId: true,
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

      if (options.notify !== false) {
        await notifyTransferCompleted(tx, {
          documentId: document.id,
          documentName: this.documentName(document),
          fromUserId: transfer.fromUserId,
          toName: recipient.name?.trim() || recipient.email,
        });
      }
      await this.audit.record(
        {
          action: AuditAction.REASSIGN,
          resource: AuditResource.DOCUMENT,
          resourceId: String(document.id),
          documentId: document.id,
          metadata: {
            transferId: id,
            ...(transfer.batchId ? { batchId: transfer.batchId } : {}),
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
    return this.cancelInternal(id, actorId);
  }

  private async cancelInternal(
    id: number,
    actorId: string,
    options: { notify?: boolean } = {},
  ) {
    return this.serializable(async (tx) => {
      const transfer = await tx.transferHistory.findUnique({
        where: { id },
        select: {
          id: true,
          documentId: true,
          fromUserId: true,
          toUserId: true,
          initiatedById: true,
          batchId: true,
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

      if (options.notify !== false) {
        await notifyTransferCanceled(tx, {
          documentId: transfer.documentId,
          documentName,
          userIds: notificationUserIds,
          canceledByRecipient,
        });
      }
      await this.audit.record(
        {
          action: AuditAction.CANCEL,
          resource: AuditResource.DOCUMENT,
          resourceId: String(transfer.documentId),
          documentId: transfer.documentId,
          metadata: {
            transferId: id,
            ...(transfer.batchId ? { batchId: transfer.batchId } : {}),
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
    });
  }

  async getReceived(userId: string) {
    return this.prisma.transferHistory.findMany({
      where: { toUserId: userId },
      include: transferInclude,
      orderBy: { createdAt: 'desc' },
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
