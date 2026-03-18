import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, NotificationStatus } from '@prisma/client';

interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  documentId?: number;
  workflowId?: number;
  actionUrl?: string;
  sendEmail?: boolean;
}

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  // ============ CRUD de Notificaciones ============

  async createNotification(data: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        documentId: data.documentId,
        workflowId: data.workflowId,
        actionUrl: data.actionUrl,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
      },
    });

    // TODO: Enviar email si sendEmail = true y el usuario tiene habilitadas las notificaciones por email
    // if (data.sendEmail) {
    //   await this.sendEmailNotification(notification);
    // }

    return notification;
  }

  async findUserNotifications(
    userId: string,
    status?: NotificationStatus,
    limit = 50,
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(status && { status }),
      },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
          },
        },
        workflow: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        status: NotificationStatus.UNREAD,
      },
    });
  }

  async markAsRead(notificationId: number, userId: string) {
    // Verificar que la notificación pertenece al usuario
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notificación con ID ${notificationId} no encontrada`,
      );
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        status: NotificationStatus.UNREAD,
      },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });

    return {
      message: 'Todas las notificaciones han sido marcadas como leídas',
    };
  }

  async deleteNotification(notificationId: number, userId: string) {
    // Verificar que la notificación pertenece al usuario
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notificación con ID ${notificationId} no encontrada`,
      );
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return {
      message: 'Notificación eliminada exitosamente',
    };
  }

  // ============ Preferencias de Notificación ============

  async getPreferences(userId: string) {
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Si no existen preferencias, crearlas con valores por defecto
    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: {
          userId,
          inAppEnabled: true,
          emailSettings: {},
          enableDigest: false,
          digestFrequency: 'daily',
        },
      });
    }

    return preferences;
  }

  async updatePreferences(
    userId: string,
    updates: {
      inAppEnabled?: boolean;
      emailSettings?: Record<string, boolean>;
      enableDigest?: boolean;
      digestFrequency?: string;
    },
  ) {
    // Obtener preferencias actuales (o crearlas)
    await this.getPreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data: updates,
    });
  }

  // ============ Métodos de Notificación por Eventos ============

  async notifyDocumentShared(
    documentId: number,
    sharedToUserId: string,
    sharedByUserName: string,
  ) {
    return this.createNotification({
      userId: sharedToUserId,
      type: NotificationType.DOCUMENT_SHARED,
      title: 'Documento compartido',
      message: `${sharedByUserName} ha compartido un documento contigo`,
      documentId,
      actionUrl: `/documents/${documentId}`,
      sendEmail: true,
    });
  }

  async notifyApprovalRequested(
    workflowId: number,
    documentId: number,
    userId: string,
    documentName: string,
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.APPROVAL_REQUESTED,
      title: 'Aprobación requerida',
      message: `Se requiere tu aprobación para el documento "${documentName}"`,
      workflowId,
      documentId,
      actionUrl: `/workflows`,
      sendEmail: true,
    });
  }

  async notifyChangesRequested(
    workflowId: number,
    documentId: number,
    initiatorId: string,
    documentName: string,
    approverName: string,
    comment?: string,
  ) {
    const message = comment
      ? `${approverName} solicitó cambios en "${documentName}": "${comment}"`
      : `${approverName} solicitó cambios en el documento "${documentName}"`;

    return this.createNotification({
      userId: initiatorId,
      type: NotificationType.CHANGES_REQUESTED,
      title: 'Se solicitaron cambios',
      message,
      workflowId,
      documentId,
      actionUrl: `/documents/${documentId}`,
      sendEmail: true,
    });
  }

  async notifyWorkflowCompleted(
    workflowId: number,
    documentId: number,
    userId: string,
    documentName: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const statusText = status === 'APPROVED' ? 'aprobado' : 'rechazado';
    return this.createNotification({
      userId,
      type: NotificationType.WORKFLOW_COMPLETED,
      title: `Workflow ${statusText}`,
      message: `El documento "${documentName}" ha sido ${statusText}`,
      workflowId,
      documentId,
      actionUrl: `/documents/${documentId}`,
      sendEmail: true,
    });
  }

  async notifyPermissionGranted(
    documentId: number,
    userId: string,
    grantedByUserName: string,
  ) {
    return this.createNotification({
      userId,
      type: NotificationType.PERMISSION_GRANTED,
      title: 'Nuevo permiso otorgado',
      message: `${grantedByUserName} te ha otorgado permisos sobre un documento`,
      documentId,
      actionUrl: `/documents/${documentId}`,
      sendEmail: false,
    });
  }

  async notifyDocumentTransferred(
    documentId: number,
    toUserId: string,
    fromUserName: string,
    documentName: string,
  ) {
    return this.createNotification({
      userId: toUserId,
      type: NotificationType.DOCUMENT_TRANSFERRED,
      title: 'Documento transferido',
      message: `${fromUserName} te ha transferido el documento "${documentName}"`,
      documentId,
      actionUrl: `/documents/${documentId}`,
      sendEmail: true,
    });
  }

  async notifyDocumentTransferredToDepartment(
    documentId: number,
    departmentId: number,
    fromUserId: string,
    fromUserName: string,
    documentName: string,
  ) {
    const users = await this.prisma.user.findMany({
      where: { departmentId },
      select: { id: true },
    });

    for (const user of users) {
      if (user.id === fromUserId) continue;

      await this.createNotification({
        userId: user.id,
        type: NotificationType.DOCUMENT_TRANSFERRED,
        title: 'Documento transferido a tu departamento',
        message: `${fromUserName} ha transferido el documento "${documentName}" a tu departamento`,
        documentId,
        actionUrl: `/documents/${documentId}`,
        sendEmail: true,
      });
    }
  }

  // TODO: Implementar servicio de email con Nodemailer
  // private async sendEmailNotification(notification: any) {
  //   // Verificar preferencias del usuario
  //   // Enviar email usando Nodemailer
  // }
}
