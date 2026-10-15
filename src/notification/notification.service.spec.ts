import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const db = { notification: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() } };
  const service = new NotificationService(db as any);
  beforeEach(() => jest.clearAllMocks());

  it('bounds pages and scopes both list and unread count to the actor', async () => {
    db.notification.findMany.mockResolvedValue([]);
    db.notification.count.mockResolvedValue(2);
    expect(await service.list('actor', 2, 20)).toEqual({ data: [], unreadCount: 2, page: 2, limit: 20 });
    expect(db.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'actor', status: { not: 'ARCHIVED' } }, skip: 20, take: 20 }));
    expect(db.notification.count).toHaveBeenCalledWith({ where: { userId: 'actor', status: 'UNREAD' } });
    await expect(service.list('actor', 0, 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot read another user notification', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.read('actor', 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, userId: 'actor', status: { not: 'ARCHIVED' } } }));
  });

  it('marks an owned notification read idempotently', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.read('actor', 1)).toEqual({ read: true });
  });
});
