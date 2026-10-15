import { AuditAction, AuditLog, AuditResource, Prisma } from '@prisma/client';

/**
 * Minimal write surface for the audit log, so a caller that already owns a
 * Prisma transaction can append to it without leaving that transaction.
 */
export type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

/** Immutable snapshot of the authenticated actor captured at request time. */
export interface AuditActor {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
}

/** Request origin captured by the middleware/interceptor chain. */
export interface AuditRequestContext {
  actor: AuditActor | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface RecordAuditInput {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string | null;
  documentId?: number | null;
  /** Free-form detail. Sensitive keys are redacted before persistence. */
  metadata?: Record<string, unknown> | null;
  /** Explicit actor that overrides the actor captured from the request. */
  actor?: AuditActor | null;
  /** Explicit request origin overrides, mainly for background jobs. */
  context?: Partial<AuditRequestContext>;
}

export interface AuditLogPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}
