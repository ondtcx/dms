import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('returns an empty context outside a request', () => {
    const service = new RequestContextService();

    expect(service.get()).toEqual({
      actor: null,
      ipAddress: null,
      userAgent: null,
      requestId: null,
    });
    expect(service.snapshot().requestId).toBeNull();
  });

  it('exposes the context inside run(), including async continuations', async () => {
    const service = new RequestContextService();

    const value = await service.run(
      { actor: null, ipAddress: '10.0.0.1', userAgent: 'agent', requestId: 'req-1' },
      async () => {
        await Promise.resolve();
        return service.snapshot();
      },
    );

    expect(value).toMatchObject({ ipAddress: '10.0.0.1', requestId: 'req-1' });
  });

  it('sets the actor on the active context', () => {
    const service = new RequestContextService();

    service.run(
      { actor: null, ipAddress: null, userAgent: null, requestId: 'req-1' },
      () => {
        service.setActor({ id: 'u1', email: 'u1@dms.test', name: 'Uno', role: 'user' });
        expect(service.snapshot().actor).toEqual({
          id: 'u1',
          email: 'u1@dms.test',
          name: 'Uno',
          role: 'user',
        });
      },
    );
  });

  it('does not leak snapshot mutations into the stored context', () => {
    const service = new RequestContextService();

    service.run(
      { actor: null, ipAddress: null, userAgent: null, requestId: 'req-1' },
      () => {
        const snapshot = service.snapshot();
        snapshot.requestId = 'mutated';
        expect(service.get().requestId).toBe('req-1');
      },
    );
  });
});
