import { TransferService } from './transfer.service';

const documentFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Documento',
  uploadedById: 'owner',
  deletedAt: null,
  archivedAt: null,
  receptionOriginDirectoryId: null,
  directory: { receptionEnabled: false },
  workflow: [],
  changeRequests: [],
  versions: [{ filename: 'documento.pdf' }],
  ...overrides,
});

const transferFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  documentId: 1,
  fromUserId: 'owner',
  toUserId: 'recipient',
  initiatedById: 'owner',
  status: 'PENDING',
  comment: null,
  document: {
    id: 1,
    name: 'Documento',
    description: null,
    uploadedById: 'owner',
    category: null,
    documentType: null,
    versions: [{ filename: 'documento.pdf', mimetype: 'application/pdf', size: 10 }],
  },
  fromUser: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
  toUser: {
    id: 'recipient',
    name: 'Recipient',
    email: 'recipient@example.com',
    isActive: true,
  },
  initiatedBy: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
  ...overrides,
});

function fixture() {
  const tx = {
    document: {
      findUnique: jest.fn().mockResolvedValue(documentFixture()),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'recipient',
        name: 'Recipient',
        email: 'recipient@example.com',
        isActive: true,
      }),
    },
    transferHistory: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(transferFixture()),
      create: jest.fn().mockResolvedValue(transferFixture()),
      update: jest.fn().mockResolvedValue(transferFixture({ status: 'COMPLETED' })),
      findMany: jest.fn().mockResolvedValue([transferFixture()]),
      count: jest.fn().mockResolvedValue(1),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: any) => operation(tx)),
    transferHistory: tx.transferHistory,
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  return { tx, prisma, audit, service: new TransferService(prisma as any, audit as any) };
}

describe('TransferService', () => {
  it('lets the owner request a transfer and notifies the recipient', async () => {
    const { tx, service, audit } = fixture();

    await service.create(
      { documentId: 1, toUserId: 'recipient', comment: '  Cambio de responsable  ' },
      'owner',
    );

    expect(tx.transferHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentId: 1,
          fromUserId: 'owner',
          toUserId: 'recipient',
          initiatedById: 'owner',
          comment: 'Cambio de responsable',
        }),
      }),
    );
    expect(tx.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'recipient',
          type: 'DOCUMENT_TRANSFERRED',
          documentId: 1,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REASSIGN',
        documentId: 1,
        metadata: expect.objectContaining({ status: 'PENDING' }),
      }),
      tx,
    );
  });

  it('rejects a transfer requested by a non-owner', async () => {
    const { service } = fixture();

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'intruder'),
    ).rejects.toThrow('No tienes permiso');
  });

  it('rejects an inactive recipient', async () => {
    const { tx, service } = fixture();
    tx.user.findUnique.mockResolvedValue({
      id: 'recipient',
      name: 'Recipient',
      email: 'recipient@example.com',
      isActive: false,
    });

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'owner'),
    ).rejects.toThrow('desactivado');
  });

  it('rejects a second pending transfer for the same document', async () => {
    const { tx, service } = fixture();
    tx.transferHistory.findFirst.mockResolvedValue({ id: 99 });

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'owner'),
    ).rejects.toThrow('Ya existe una transferencia pendiente');
  });

  it('maps a concurrent pending-transfer race to a conflict', async () => {
    const { prisma, service } = fixture();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'owner'),
    ).rejects.toThrow('Ya existe una transferencia pendiente');
  });

  it('rejects reception documents', async () => {
    const { tx, service } = fixture();
    tx.document.findUnique.mockResolvedValue(
      documentFixture({ receptionOriginDirectoryId: 4 }),
    );

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'owner'),
    ).rejects.toThrow('recepción');
  });

  it('rejects documents with an active workflow', async () => {
    const { tx, service } = fixture();
    tx.document.findUnique.mockResolvedValue(
      documentFixture({ workflow: [{ id: 3 }] }),
    );

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'owner'),
    ).rejects.toThrow('workflow activo');
  });

  it('rejects documents with an active change request', async () => {
    const { tx, service } = fixture();
    tx.document.findUnique.mockResolvedValue(
      documentFixture({ changeRequests: [{ id: 8 }] }),
    );

    await expect(
      service.create({ documentId: 1, toUserId: 'recipient' }, 'owner'),
    ).rejects.toThrow('solicitud de cambios');
  });

  it('lets an admin initiate on behalf of the current owner', async () => {
    const { tx, service } = fixture();

    await service.createForOwner(
      { documentId: 1, toUserId: 'recipient' },
      'admin',
    );

    expect(tx.transferHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromUserId: 'owner',
          initiatedById: 'admin',
        }),
      }),
    );
  });

  it('accepts a pending transfer and changes the document owner', async () => {
    const { tx, service, audit } = fixture();
    tx.transferHistory.update.mockResolvedValue(
      transferFixture({ status: 'COMPLETED' }),
    );

    await service.accept(7, 'recipient');

    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { uploadedById: 'recipient' },
    });
    expect(tx.transferHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REASSIGN',
        metadata: expect.objectContaining({ status: 'COMPLETED' }),
      }),
      tx,
    );
  });

  it('rejects acceptance when the document owner changed after the request', async () => {
    const { tx, service } = fixture();
    tx.document.findUnique.mockResolvedValue(
      documentFixture({ uploadedById: 'new-owner' }),
    );

    await expect(service.accept(7, 'recipient')).rejects.toThrow(
      'La propiedad del documento cambió',
    );
    expect(tx.document.update).not.toHaveBeenCalled();
  });

  it('rejects acceptance by anyone except the recipient', async () => {
    const { service } = fixture();

    await expect(service.accept(7, 'owner')).rejects.toThrow(
      'Solo el destinatario',
    );
  });

  it('lets the recipient reject a pending transfer without changing ownership', async () => {
    const { tx, service } = fixture();
    tx.transferHistory.update.mockResolvedValue(
      transferFixture({ status: 'CANCELED' }),
    );

    await service.cancel(7, 'recipient');

    expect(tx.transferHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ status: 'CANCELED' }),
      }),
    );
    expect(tx.document.update).not.toHaveBeenCalled();
  });

  it('rejects cancellation by an unrelated user', async () => {
    const { service } = fixture();

    await expect(service.cancel(7, 'intruder')).rejects.toThrow(
      'No tienes permiso para cancelar',
    );
  });

  it('reports sent, received, and pending counts', async () => {
    const { tx, service } = fixture();
    tx.transferHistory.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    await expect(service.getStats('recipient')).resolves.toEqual({
      sent: 2,
      received: 3,
      total: 4,
      pending: 1,
    });
  });
});
