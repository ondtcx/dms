import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const db = {
    notification: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    notificationPreference: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const service = new NotificationService(db as any);
  beforeEach(() => jest.clearAllMocks());

  it('bounds pages and scopes both list and unread count to the actor', async () => {
    db.notificationPreference.findUnique.mockResolvedValue(null);
    db.notification.findMany.mockResolvedValue([]);
    db.notification.count.mockResolvedValue(2);
    expect(await service.list('actor', 2, 20)).toEqual({ data: [], unreadCount: 2, page: 2, limit: 20, filter: 'all' });
    expect(db.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'actor', status: { not: 'ARCHIVED' } }, skip: 20, take: 20 }));
    expect(db.notification.count).toHaveBeenCalledWith({ where: { userId: 'actor', status: 'UNREAD' } });
    await expect(service.list('actor', 0, 100)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an empty page when in-app notifications are disabled', async () => {
    db.notificationPreference.findUnique.mockResolvedValue({ inAppEnabled: false });
    expect(await service.list('actor')).toEqual({ data: [], unreadCount: 0, page: 1, limit: 20, filter: 'all' });
    expect(db.notification.findMany).not.toHaveBeenCalled();
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

  it('returns the default in-app preference when none exists', async () => {
    db.notificationPreference.findUnique.mockResolvedValue(null);
    expect(await service.getPreferences('actor')).toEqual({ inAppEnabled: true });
  });

  it('upserts the preference for the current user', async () => {
    db.notificationPreference.upsert.mockResolvedValue({ inAppEnabled: false });
    expect(await service.updatePreferences('actor', false)).toEqual({
      inAppEnabled: false,
    });
    expect(db.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'actor' },
      create: { userId: 'actor', inAppEnabled: false },
      update: { inAppEnabled: false },
      select: { inAppEnabled: true },
    });
  });

  it('filters unread and read notifications without losing the unread count', async () => {
    db.notificationPreference.findUnique.mockResolvedValue(null);
    db.notification.findMany.mockResolvedValue([]);
    db.notification.count.mockResolvedValue(3);

    await service.list('actor', 1, 20, 'unread');
    expect(db.notification.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: 'actor', status: 'UNREAD' },
      }),
    );

    await service.list('actor', 1, 20, 'read');
    expect(db.notification.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: 'actor', status: 'READ' },
      }),
    );
    expect(db.notification.count).toHaveBeenCalledWith({
      where: { userId: 'actor', status: 'UNREAD' },
    });
  });

  it('marks an owned notification unread and clears readAt', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.unread('actor', 7)).toEqual({ read: false });
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 7, userId: 'actor', status: { not: 'ARCHIVED' } },
      data: { status: 'UNREAD', readAt: null },
    });
  });

  it('archives only an owned notification', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.archive('actor', 8)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    db.notification.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.archive('actor', 8)).toEqual({ deleted: true });
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 8, userId: 'actor', status: { not: 'ARCHIVED' } },
      data: { status: 'ARCHIVED' },
    });
  });

  it('archives all read notifications for the actor', async () => {
    db.notification.updateMany.mockResolvedValue({ count: 4 });
    expect(await service.archiveRead('actor')).toEqual({
      deleted: true,
      count: 4,
    });
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'actor', status: 'READ' },
      data: { status: 'ARCHIVED' },
    });
  });
});
