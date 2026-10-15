import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuditActor } from './audit.types';
import { RequestContextService } from './request-context.service';

/**
 * Runs after the global auth guard and stores the authenticated user as an
 * immutable actor snapshot on the active request context.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly context: RequestContextService) {}

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (executionContext.getType() === 'http') {
      const request = executionContext.switchToHttp().getRequest();
      this.context.setActor(this.toActor(request?.user));
    }
    return next.handle();
  }

  private toActor(user: unknown): AuditActor | null {
    if (!user || typeof user !== 'object') return null;
    const source = user as Record<string, unknown>;
    const id = source.id ?? source.sub;
    if (!id) return null;

    return {
      id: String(id),
      email: (source.email as string) ?? null,
      name: (source.name as string) ?? null,
      role: (source.role as string) ?? null,
    };
  }
}
