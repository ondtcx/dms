import { DocumentChangeRequestService } from './document-change-request.service';

describe('standalone change requests', () => {
  function fixture() {
    let request: any = null;
    const document = { id: 1, uploadedById: 'owner', currentVersion: 2, versions: [{ id: 12, version: 2 }], directoryId: null, directory: null, isPublic: false };
    const db: any = {
      $queryRaw: jest.fn(),
      document: { findUnique: jest.fn(async () => document), findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      user: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, role: where.id === 'admin' ? 'admin' : 'user', roleAssignments: [] })), findMany: jest.fn().mockResolvedValue([]) },
      effectiveAccessGrant: { findMany: jest.fn().mockResolvedValue([]) },
      documentWorkflow: { findFirst: jest.fn().mockResolvedValue(null) },
      accessGrant: { create: jest.fn(async ({ data }) => ({ id: 3, ...data })) },
      notification: { create: jest.fn() },
      documentChangeRequest: {
        findFirst: jest.fn(async () => request), findUnique: jest.fn(async () => request),
        create: jest.fn(async ({ data }) => (request = { id: 8, revision: 0, ...data })),
        update: jest.fn(async ({ data }) => (request = { ...request, ...data, revision: request.revision + 1 })),
      },
    };
    db.$transaction = jest.fn(cb => cb(db));
    const storage = { writePrivateCorrection: jest.fn().mockReturnValue('private/file'), deleteFile: jest.fn(), readPrivateCorrection: jest.fn().mockReturnValue(Buffer.from('file')) };
    const documents = { promoteChangeRequestCorrection: jest.fn().mockResolvedValue({ id: 13 }), refreshAcceptedCorrection: jest.fn() };
    const settings = { getMaxFileSizeMb: jest.fn().mockResolvedValue(5), getAllowedMimeTypes: jest.fn().mockResolvedValue(['text/plain']) };
    const service = new DocumentChangeRequestService(db, storage as any, settings as any, documents as any);
    return { service, db, storage, document, documents, setRequest: (value: any) => { request = value; } };
  }
  const input = { recipientId: 'recipient', message: 'Corregir' };

  it('rejects non-owner non-admin even with sharing authority', async () => {
    const { service, db, storage } = fixture();
    await expect(service.create(1, 'delegate', input)).rejects.toThrow('propietario');
    expect(db.documentChangeRequest.create).not.toHaveBeenCalled();
    expect(storage.writePrivateCorrection).not.toHaveBeenCalled();
  });

  it('requires explicit sharing confirmation and atomically grants only read access', async () => {
    const { service, db } = fixture();
    db.document.findFirst.mockResolvedValue(null);
    await expect(service.create(1, 'owner', input)).rejects.toThrow('confirmar');
    expect(db.accessGrant.create).not.toHaveBeenCalled();
    await service.create(1, 'owner', { ...input, confirmShare: true });
    expect(db.accessGrant.create).toHaveBeenCalledWith({ data: expect.objectContaining({ canView: true, canEdit: false, canUploadVersion: false, canShare: false }) });
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('does not grant redundant access when authoritative inherited/public read succeeds', async () => {
    const { service, db } = fixture();
    await service.create(1, 'admin', input);
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });

  it('counts submitted corrections as active and prevents another request', async () => {
    const { service, setRequest } = fixture();
    setRequest({ id: 8, status: 'CORRECTION_SUBMITTED' });
    await expect(service.create(1, 'owner', input)).rejects.toThrow('activa');
  });

  it('recipient can submit privately without an ordinary update grant', async () => {
    const { service, db, storage } = fixture();
    await service.create(1, 'owner', input);
    await service.submit(1, 8, 'recipient', 0, { originalname: '../correction.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('file') } as any);
    expect(storage.writePrivateCorrection).toHaveBeenCalled();
    expect(db.documentChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CORRECTION_SUBMITTED', filename: 'correction.txt' }) }));
    expect(db.accessGrant.create).not.toHaveBeenCalled();
  });

  it('denies outsider uploads before filesystem effects', async () => {
    const { service, storage } = fixture();
    await service.create(1, 'owner', input);
    await expect(service.submit(1, 8, 'outsider', 0, {} as any)).rejects.toThrow();
    expect(storage.writePrivateCorrection).not.toHaveBeenCalled();
  });

  it('further changes reuse the active request and never promote a version', async () => {
    const { service, documents, setRequest } = fixture();
    setRequest({ id: 8, documentId: 1, recipientId: 'recipient', requestedById: 'owner', status: 'CORRECTION_SUBMITTED', revision: 1, baseVersionId: 12, stagedPath: 'private/file' });
    const result = await service.decide(1, 8, 'owner', { revision: 1, action: 'further', message: 'Otra revisión' });
    expect(result.status).toBe('IN_PROGRESS');
    expect(documents.promoteChangeRequestCorrection).not.toHaveBeenCalled();
  });

  it('rejects recipient acceptance, stale decisions and principal drift', async () => {
    const { service, setRequest, document, documents } = fixture();
    setRequest({ id: 8, documentId: 1, recipientId: 'recipient', status: 'CORRECTION_SUBMITTED', revision: 1, baseVersionId: 12 });
    await expect(service.decide(1, 8, 'recipient', { revision: 1, action: 'accept' })).rejects.toThrow('propietario');
    await expect(service.decide(1, 8, 'owner', { revision: 0, action: 'accept' })).rejects.toThrow('cambió');
    document.versions[0].id = 14;
    await expect(service.decide(1, 8, 'owner', { revision: 1, action: 'accept' })).rejects.toThrow('principal');
    expect(documents.promoteChangeRequestCorrection).not.toHaveBeenCalled();
  });

  it('accepts once through transaction-aware promotion and permits cancellation', async () => {
    const { service, setRequest, documents, db } = fixture();
    setRequest({ id: 8, documentId: 1, recipientId: 'recipient', requestedById: 'owner', status: 'CORRECTION_SUBMITTED', revision: 1, baseVersionId: 12, stagedPath: 'private/file' });
    expect((await service.decide(1, 8, 'admin', { revision: 1, action: 'accept' })).status).toBe('ACCEPTED');
    expect(documents.promoteChangeRequestCorrection).toHaveBeenCalledWith(db, 8, 'admin', expect.any(Function));
    await expect(service.decide(1, 8, 'admin', { revision: 1, action: 'accept' })).rejects.toThrow();
    setRequest({ id: 9, documentId: 1, recipientId: 'recipient', requestedById: 'owner', status: 'PENDING', revision: 0 });
    expect((await service.decide(1, 9, 'owner', { revision: 0, action: 'cancel' })).status).toBe('CANCELLED');
  });

  it('rejects protected reception and active workflows before creating a request', async () => {
    const { service, document, db } = fixture();
    document.directory = { receptionEnabled: true } as any;
    await expect(service.create(1, 'admin', input)).rejects.toThrow('recepción');
    document.directory = null;
    db.documentWorkflow.findFirst.mockResolvedValue({ status: 'PENDING' });
    await expect(service.create(1, 'owner', input)).rejects.toThrow('workflow');
  });

  it('rechecks recipient read access and workflow boundaries before staging a correction', async () => {
    const { service, db, storage } = fixture();
    await service.create(1, 'owner', input);
    const file = { originalname: 'correction.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('file') } as any;
    db.document.findFirst.mockResolvedValue(null);
    await expect(service.submit(1, 8, 'recipient', 0, file)).rejects.toThrow('acceso');
    db.document.findFirst.mockResolvedValue({ id: 1 });
    db.documentWorkflow.findFirst.mockResolvedValue({ status: 'IN_PROGRESS' });
    await expect(service.submit(1, 8, 'recipient', 0, file)).rejects.toThrow('workflow');
    expect(storage.writePrivateCorrection).not.toHaveBeenCalled();
  });

  it.each([
    { originalname: 'run.exe', mimetype: 'text/plain', size: 4, buffer: Buffer.from('file') },
    { originalname: 'file.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('file') },
    { originalname: 'file.txt', mimetype: 'text/plain', size: 9, buffer: Buffer.from('file') },
  ])('rejects disallowed correction files before filesystem writes', async file => {
    const { service, storage } = fixture();
    await service.create(1, 'owner', input);
    await expect(service.submit(1, 8, 'recipient', 0, file as any)).rejects.toThrow('permitido');
    expect(storage.writePrivateCorrection).not.toHaveBeenCalled();
  });

  it('compensates staged bytes if notification persistence aborts submission', async () => {
    const { service, db, storage } = fixture();
    await service.create(1, 'owner', input);
    db.notification.create.mockRejectedValue(new Error('notification failed'));
    await expect(service.submit(1, 8, 'recipient', 0,
      { originalname: 'correction.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('file') } as any)).rejects.toThrow('notification failed');
    expect(storage.deleteFile).toHaveBeenCalledWith('private/file');
  });

  it('cancellation prevents stale uploads and leaves terminal requests eligible for a new request', async () => {
    const { service, db, storage } = fixture();
    await service.create(1, 'owner', input);
    await service.decide(1, 8, 'owner', { action: 'cancel', revision: 0 });
    await expect(service.submit(1, 8, 'recipient', 0, {} as any)).rejects.toThrow('cambió');
    expect(storage.writePrivateCorrection).not.toHaveBeenCalled();
    const snapshot = await service.get(1, 'owner');
    expect(snapshot.capabilities.create).toBe(true);
    db.documentChangeRequest.findFirst.mockResolvedValue(null);
    await expect(service.create(1, 'owner', input)).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('downloads privately only for the current recipient or an independently authorized manager', async () => {
    const { service, setRequest, storage } = fixture();
    setRequest({ id: 8, documentId: 1, recipientId: 'recipient', status: 'CORRECTION_SUBMITTED', stagedPath: 'private/file', filename: 'file.txt' });
    await expect(service.download(1, 8, 'outsider')).rejects.toThrow('encontrada');
    expect(storage.readPrivateCorrection).not.toHaveBeenCalled();
    expect((await service.download(1, 8, 'recipient')).buffer).toEqual(Buffer.from('file'));
    expect((await service.get(1, 'owner')).request).not.toHaveProperty('stagedPath');
  });
});
