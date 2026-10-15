import { AuditAction, AuditResource } from '@prisma/client';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { RequestContextService } from './request-context.service';

describe('AuditService', () => {
  function createService() {
    const prisma: any = {
      auditLog: {
        create: jest.fn(async ({ data }: any) => ({ id: 'audit-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const context = new RequestContextService();
    return { prisma, context, service: new AuditService(prisma, context) };
  }

  it('records the actor snapshot and request origin from the active context', async () => {
    const { prisma, context, service } = createService();

    await context.run(
      {
        actor: { id: 'user-1', email: 'ada@dms.test', name: 'Ada', role: 'admin' },
        ipAddress: '203.0.113.10',
        userAgent: 'jest-agent',
        requestId: 'req-1',
      },
      () =>
        service.record({
          action: AuditAction.UPDATE,
          resource: AuditResource.DOCUMENT,
          resourceId: '42',
          documentId: 42,
        }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.UPDATE,
        resource: AuditResource.DOCUMENT,
        resourceId: '42',
        documentId: 42,
        actorId: 'user-1',
        actorEmail: 'ada@dms.test',
        actorName: 'Ada',
        actorRole: 'admin',
        ipAddress: '203.0.113.10',
        userAgent: 'jest-agent',
        requestId: 'req-1',
      }),
    });
  });

  it('lets an explicit actor override the request actor', async () => {
    const { prisma, context, service } = createService();

    await context.run(
      {
        actor: { id: 'context-actor', email: null, name: null, role: null },
        ipAddress: '10.0.0.1',
        userAgent: null,
        requestId: 'req-2',
      },
      () =>
        service.record({
          action: AuditAction.CREATE,
          resource: AuditResource.DOCUMENT,
          actor: { id: 'explicit', email: 'eve@dms.test', name: 'Eve', role: 'user' },
        }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'explicit',
        actorEmail: 'eve@dms.test',
      }),
    });
  });

  it('writes through a caller-supplied transaction client', async () => {
    const { prisma, service } = createService();
    const tx: any = {
      auditLog: {
        create: jest.fn(async ({ data }: any) => ({ id: 'audit-tx', ...data })),
      },
    };

    await service.record(
      { action: AuditAction.VIEW, resource: AuditResource.DOCUMENT, documentId: 7 },
      tx,
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.VIEW,
        resource: AuditResource.DOCUMENT,
        documentId: 7,
      }),
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('redacts sensitive metadata keys recursively', () => {
    const { service } = createService();

    const sanitized = service.sanitizeMetadata({
      password: 'p@ss',
      nested: { refreshToken: 'abc', keep: 'value' },
      items: [{ totpSecret: 'zzz' }],
    });

    expect(sanitized).toEqual({
      password: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', keep: 'value' },
      items: [{ totpSecret: '[REDACTED]' }],
    });
  });

  it('omits metadata when none is provided', async () => {
    const { prisma, service } = createService();

    await service.record({ action: AuditAction.VIEW, resource: AuditResource.DOCUMENT });

    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toBeUndefined();
  });

  it('builds filters and pagination when querying', async () => {
    const { prisma, service } = createService();
    const query: AuditLogQueryDto = {
      page: 2,
      limit: 10,
      action: AuditAction.DELETE,
      resource: AuditResource.DOCUMENT,
      resourceId: '42',
      documentId: 42,
      actorId: 'user-1',
      requestId: 'req-1',
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-12-31T23:59:59.000Z'),
    };

    const result = await service.query(query);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: AuditAction.DELETE,
        resource: AuditResource.DOCUMENT,
        resourceId: '42',
        documentId: 42,
        actorId: 'user-1',
        requestId: 'req-1',
        createdAt: { gte: query.from, lte: query.to },
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({ data: [], total: 0, page: 2, limit: 10 });
  });

  it('defaults to the first page when no pagination is supplied', async () => {
    const { prisma, service } = createService();

    const result = await service.query({} as AuditLogQueryDto);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('exposes only append and read operations', () => {
    const { service } = createService();
    const prototype = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(prototype).toContain('record');
    expect(prototype).toContain('query');
    expect(prototype).not.toContain('update');
    expect(prototype).not.toContain('delete');
    expect(prototype).not.toContain('remove');
  });
});
