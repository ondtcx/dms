import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, page = 1, limit = 20) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('Paginación inválida');
    }
    const [data, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: actorId, status: { not: 'ARCHIVED' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
        select: { id: true, type: true, status: true, title: true, message: true, documentId: true, actionUrl: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId: actorId, status: 'UNREAD' } }),
    ]);
    return { data, unreadCount, page, limit };
  }

  async read(actorId: string, id: number) {
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Notificación inválida');
    const result = await this.prisma.notification.updateMany({
      where: { id, userId: actorId, status: { not: 'ARCHIVED' } }, data: { status: 'READ', readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notificación no encontrada');
    return { read: true };
  }
}
