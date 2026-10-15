import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { AuditContextInterceptor } from './audit-context.interceptor';
import { RequestContextService } from './request-context.service';

describe('AuditContextInterceptor', () => {
  function execute(user: unknown, type = 'http') {
    const context = new RequestContextService();
    const interceptor = new AuditContextInterceptor(context);
    const executionContext = {
      getType: () => type,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of('ok') } as CallHandler;
    let actor: unknown;

    context.run(
      { actor: null, ipAddress: null, userAgent: null, requestId: 'req-1' },
      () => {
        interceptor.intercept(executionContext, next).subscribe();
        actor = context.snapshot().actor;
      },
    );

    return actor;
  }

  it('captures the authenticated actor as a snapshot', () => {
    expect(
      execute({ id: 'u1', sub: 'u1', email: 'u1@dms.test', name: 'Uno', role: 'admin' }),
    ).toEqual({
      id: 'u1',
      email: 'u1@dms.test',
      name: 'Uno',
      role: 'admin',
    });
  });

  it('captures nothing for anonymous requests', () => {
    expect(execute(undefined)).toBeNull();
  });
});
