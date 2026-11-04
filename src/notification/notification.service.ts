import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationFilter = 'all' | 'unread' | 'read';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(actorId: string) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId: actorId },
      select: { inAppEnabled: true },
    });
    return { inAppEnabled: preference?.inAppEnabled ?? true };
  }

  async updatePreferences(actorId: string, inAppEnabled: boolean) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId: actorId },
      create: { userId: actorId, inAppEnabled },
      update: { inAppEnabled },
      select: { inAppEnabled: true },
    });
    return { inAppEnabled: preference.inAppEnabled };
  }

  async list(
    actorId: string,
    page = 1,
    limit = 20,
    filter: NotificationFilter = 'all',
  ) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 10000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    ) {
      throw new BadRequestException('Paginación inválida');
    }
    if (!['all', 'unread', 'read'].includes(filter)) {
      throw new BadRequestException('Filtro de notificaciones inválido');
    }
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId: actorId },
      select: { inAppEnabled: true },
    });
    if (preference && !preference.inAppEnabled) {
      return { data: [], unreadCount: 0, page, limit, filter };
    }

    const statusWhere: Prisma.NotificationWhereInput['status'] =
      filter === 'unread'
        ? 'UNREAD'
        : filter === 'read'
          ? 'READ'
          : { not: 'ARCHIVED' };
    const [data, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: actorId, status: statusWhere },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          message: true,
          documentId: true,
          actionUrl: true,
          createdAt: true,
          readAt: true,
          actorId: true,
          actorName: true,
          actorRole: true,
          document: { select: { id: true, name: true } },
        },
      }),
      this.prisma.notification.count({
        where: { userId: actorId, status: 'UNREAD' },
      }),
    ]);
    return { data, unreadCount, page, limit, filter };
  }

  async readAll(actorId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: actorId, status: 'UNREAD' },
      data: { status: 'READ', readAt: new Date() },
    });
    return { read: true, count: result.count };
  }

  async read(actorId: string, id: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Notificación inválida');
    const result = await this.prisma.notification.updateMany({
      where: { id, userId: actorId, status: { not: 'ARCHIVED' } },
      data: { status: 'READ', readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notificación no encontrada');
    return { read: true };
  }

  async unread(actorId: string, id: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Notificación inválida');
    const result = await this.prisma.notification.updateMany({
      where: { id, userId: actorId, status: { not: 'ARCHIVED' } },
      data: { status: 'UNREAD', readAt: null },
    });
    if (!result.count) throw new NotFoundException('Notificación no encontrada');
    return { read: false };
  }

  async archive(actorId: string, id: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('Notificación inválida');
    const result = await this.prisma.notification.updateMany({
      where: { id, userId: actorId, status: { not: 'ARCHIVED' } },
      data: { status: 'ARCHIVED' },
    });
    if (!result.count) throw new NotFoundException('Notificación no encontrada');
    return { deleted: true };
  }

  async archiveRead(actorId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: actorId, status: 'READ' },
      data: { status: 'ARCHIVED' },
    });
    return { deleted: true, count: result.count };
  }
}
