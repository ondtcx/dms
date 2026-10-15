jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(),
}));
import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '@prisma/client';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';
import { DocumentController } from './document.controller';

describe('DocumentController final thumbnail read boundary', () => {
  const document = { versions: [{ path: 'synthetic.pdf', mimetype: 'application/pdf', createdAt: new Date() }] };
  const documents = { findOne: jest.fn() };
  const thumbnails = { getThumbnailPath: jest.fn(), generateThumbnail: jest.fn() };
  const response = { set: jest.fn() };
  const controller = new DocumentController(documents as any, {} as any, thumbnails as any, {} as any, {} as any);

  beforeEach(() => {
    jest.resetAllMocks();
    documents.findOne.mockResolvedValue(document);
    thumbnails.getThumbnailPath.mockReturnValue(null);
    thumbnails.generateThumbnail.mockResolvedValue('synthetic-thumbnail.jpg');
    (createReadStream as jest.Mock).mockReturnValue(Readable.from(Buffer.from('synthetic')));
  });

  it('does not generate bytes after initial read denial', async () => {
    documents.findOne.mockRejectedValue(new ForbiddenException());
    await expect(controller.getThumbnail(1, { id: 'user', role: 'USER' }, response as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(thumbnails.generateThumbnail).not.toHaveBeenCalled();
    expect(createReadStream).not.toHaveBeenCalled();
  });

  it('rechecks read after generation and does not open a stream after revocation', async () => {
    documents.findOne.mockResolvedValueOnce(document).mockRejectedValueOnce(new ForbiddenException());
    await expect(controller.getThumbnail(1, { id: 'user', role: 'USER' }, response as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(thumbnails.generateThumbnail).toHaveBeenCalledTimes(1);
    expect(createReadStream).not.toHaveBeenCalled();
    expect(response.set).not.toHaveBeenCalled();
  });

  it('preserves authorized generation and emits only after the final read', async () => {
    await controller.getThumbnail(1, { id: 'user', role: 'USER' }, response as any);
    expect(documents.findOne).toHaveBeenCalledTimes(2);
    expect(documents.findOne).toHaveBeenLastCalledWith(1, 'user', 'USER');
    expect(thumbnails.generateThumbnail.mock.invocationCallOrder[0]).toBeLessThan(documents.findOne.mock.invocationCallOrder[1]);
    expect(documents.findOne.mock.invocationCallOrder[1]).toBeLessThan((createReadStream as jest.Mock).mock.invocationCallOrder[0]);
  });

  it('preserves the unsupported thumbnail error without opening a stream', async () => {
    thumbnails.generateThumbnail.mockResolvedValue(null);
    await expect(controller.getThumbnail(1, { id: 'user', role: 'USER' }, response as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(createReadStream).not.toHaveBeenCalled();
  });
});

describe('DocumentController document audit boundary', () => {
  const documents = { getAuditTrail: jest.fn(), recordLifecycleAudit: jest.fn() };
  const templates = { createDocumentFromTemplate: jest.fn(), updateDocumentFromTemplate: jest.fn() };
  const reflector = new Reflector();
  const controller = new DocumentController(
    documents as any,
    templates as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.resetAllMocks());

  it('delegates owner authorization instead of excluding nonprivileged roles', () => {
    expect(reflector.get(ROLES_KEY, DocumentController.prototype.getAudit)).toBeUndefined();
  });

  it('denies the coordinator role from the audit trail metadata', () => {
    const roles =
      reflector.get<UserRole[]>(ROLES_KEY, DocumentController.prototype.getAudit) ?? [];
    expect(roles).not.toContain(UserRole.COORDINADOR);
  });

  it('retains effective RECTOR authorization when delegating', async () => {
    await controller.getAudit(7, {} as any, { id: 'reviewer', role: UserRole.USER, roles: [UserRole.RECTOR] });
    expect(documents.getAuditTrail).toHaveBeenCalledWith(7, {}, 'reviewer', UserRole.RECTOR);
  });

  it('delegates the authorized paginated query to the document service', async () => {
    const query = { page: 2, limit: 5 };
    const page = { data: [], total: 0, page: 2, limit: 5 };
    documents.getAuditTrail.mockResolvedValue(page);

    await expect(
      controller.getAudit(7, query as any, { id: 'reviewer', role: UserRole.ADMIN }),
    ).resolves.toEqual(page);
    expect(documents.getAuditTrail).toHaveBeenCalledWith(7, query, 'reviewer', UserRole.ADMIN);
  });

  it('records template generation after the delegated create commits', async () => {
    templates.createDocumentFromTemplate.mockResolvedValue({ id: 5, filename: 'acta.pdf' });

    await expect(
      controller.createFromTemplate({ templateId: 1 } as any, {
        id: 'owner',
        role: UserRole.ADMIN,
      }),
    ).resolves.toMatchObject({ id: 5 });
    expect(documents.recordLifecycleAudit).toHaveBeenCalledWith({
      action: AuditAction.CREATE,
      documentId: 5,
    });
  });

  it('does not append a lifecycle event when the create yields no document', async () => {
    templates.createDocumentFromTemplate.mockResolvedValue(undefined);

    await controller.createFromTemplate({ templateId: 1 } as any, {
      id: 'owner',
      role: UserRole.ADMIN,
    });
    expect(documents.recordLifecycleAudit).not.toHaveBeenCalled();
  });

  it('records template regeneration after the delegated update commits', async () => {
    templates.updateDocumentFromTemplate.mockResolvedValue({ id: 5 });

    await controller.updateFromTemplate(5, { formData: {} } as any, {
      id: 'owner',
      role: UserRole.ADMIN,
    });
    expect(documents.recordLifecycleAudit).toHaveBeenCalledWith({
      action: AuditAction.UPDATE,
      documentId: 5,
    });
  });
});

describe('DocumentController metadata detail', () => {
  it('requests existing detail capabilities without invoking a file view', async () => {
    const detail = { id: 7, actionCapabilities: { read: true }, batchCapabilities: {} };
    const documents: any = { findOne: jest.fn().mockResolvedValue(detail), view: jest.fn() };
    const controller = new DocumentController(documents, {} as any, {} as any, {} as any, {} as any);

    await expect(controller.findOne(7, { id: 'actor', role: UserRole.ADMIN })).resolves.toEqual(detail);
    expect(documents.findOne).toHaveBeenCalledWith(7, 'actor', UserRole.ADMIN, true);
    expect(documents.view).not.toHaveBeenCalled();
  });
});

describe('DocumentController upload multipart contract', () => {
  function bodySchema(method: keyof DocumentController) {
    const parameters =
      Reflect.getMetadata(
        'swagger/apiParameters',
        DocumentController.prototype[method],
      ) ?? [];
    return parameters.find((parameter: any) => parameter.in === 'body')?.schema;
  }

  it('marks documentTypeId optional and nullable in the single upload body', () => {
    const schema = bodySchema('upload');
    expect(schema.required).toEqual(['file']);
    expect(schema.required).not.toContain('documentTypeId');
    expect(schema.properties.documentTypeId).toMatchObject({
      type: 'integer',
      nullable: true,
    });
  });
});
