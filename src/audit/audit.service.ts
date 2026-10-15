import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REDACTED, SENSITIVE_AUDIT_KEYS } from './audit.constants';
import { AuditLogPage, AuditWriter, RecordAuditInput } from './audit.types';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { RequestContextService } from './request-context.service';

/**
 * Append-only audit trail.
 *
 * Contract:
 * - `record` is the only write operation; there is intentionally no update or
 *   delete method so audit entries are immutable from the application.
 * - `metadata` is always passed through `sanitizeMetadata`, which redacts
 *   sensitive keys recursively. Callers can pass raw payloads safely.
 * - `db` lets a caller append within an existing transaction so the event
 *   commits atomically with the change it describes.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async record(
    input: RecordAuditInput,
    db: AuditWriter = this.prisma,
  ): Promise<AuditLog> {
    const context = this.requestContext.get();
    const actor = input.actor ?? context.actor;

    return db.auditLog.create({
      data: {
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        documentId: input.documentId ?? null,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        actorName: actor?.name ?? null,
        actorRole: actor?.role ?? null,
        ipAddress: input.context?.ipAddress ?? context.ipAddress,
        userAgent: input.context?.userAgent ?? context.userAgent,
        requestId: input.context?.requestId ?? context.requestId,
        metadata: this.sanitizeMetadata(input.metadata),
      },
    });
  }

  async query(query: AuditLogQueryDto): Promise<AuditLogPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /** Recursively replaces sensitive values before they reach the database. */
  sanitizeMetadata(
    metadata?: Record<string, unknown> | null,
  ): Prisma.InputJsonValue | undefined {
    if (metadata == null) return undefined;
    return this.sanitizeValue(metadata) as Prisma.InputJsonValue;
  }

  private sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitizeValue(item));
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        result[key] = SENSITIVE_AUDIT_KEYS.has(key.toLowerCase())
          ? REDACTED
          : this.sanitizeValue(item);
      }
      return result;
    }
    return value;
  }

  private buildWhere(query: AuditLogQueryDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.documentId !== undefined) where.documentId = query.documentId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.requestId) where.requestId = query.requestId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }
    return where;
  }
}
