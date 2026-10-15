import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { AuditActor, AuditRequestContext } from './audit.types';

const EMPTY_CONTEXT: AuditRequestContext = {
  actor: null,
  ipAddress: null,
  userAgent: null,
  requestId: null,
};

/**
 * Holds the per-request audit context using AsyncLocalStorage so that services
 * can capture the actor and request origin without request-scoped providers.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<AuditRequestContext>();

  run<T>(context: AuditRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): AuditRequestContext {
    return this.storage.getStore() ?? EMPTY_CONTEXT;
  }

  /** Returns a copy so callers cannot mutate the stored context. */
  snapshot(): AuditRequestContext {
    return { ...this.get() };
  }

  setActor(actor: AuditActor | null): void {
    const context = this.storage.getStore();
    if (context) context.actor = actor;
  }

  getRequestId(): string | null {
    return this.get().requestId;
  }
}
