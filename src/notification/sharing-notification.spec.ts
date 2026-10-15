import { notifySharingGrant } from './sharing-notification';

describe('sharing notifications', () => {
  const db = { notification: { create: jest.fn() } };
  beforeEach(() => jest.clearAllMocks());
  const grant = { canView: true, canEdit: false, canShare: false, canUploadVersion: false, expiresAt: null, revokedAt: null };

  it('does not notify an identical live grant', async () => {
    await notifySharingGrant(db, 'document', { id: 1, name: 'Documento' }, 'recipient', grant, grant);
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('notifies a newly received folder in the grant transaction', async () => {
    await notifySharingGrant(db, 'directory', { id: 4, name: 'Carpeta' }, 'recipient', null, grant);
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'recipient', type: 'DOCUMENT_SHARED', actionUrl: '/dashboard/directories?directoryId=4' }) });
  });

  it('preserves a plain-text sharing comment and rejects excessive comments', async () => {
    await notifySharingGrant(db, 'document', { id: 1, name: 'Documento' }, 'recipient', null, grant, '<b>Revisar</b>');
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ message: 'Documento\n<b>Revisar</b>' }) });
    await expect(notifySharingGrant(db, 'document', { id: 1 }, 'recipient', null, grant, 'x'.repeat(2001))).rejects.toThrow();
  });
});
