import { RequestContextMiddleware } from './request-context.middleware';
import { RequestContextService } from './request-context.service';

describe('RequestContextMiddleware', () => {
  function run(headers: Record<string, unknown>, request: Record<string, unknown> = {}) {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const response = { setHeader: jest.fn() };
    let captured: any;

    middleware.use({ headers, ...request } as any, response as any, () => {
      captured = context.snapshot();
    });

    return { captured, response };
  }

  it('reuses a provided x-request-id header and echoes it back', () => {
    const { captured, response } = run({ 'x-request-id': 'given-id', 'user-agent': 'jest' });

    expect(captured.requestId).toBe('given-id');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'given-id');
  });

  it('generates a request id when the header is missing', () => {
    const { captured } = run({});

    expect(captured.requestId).toEqual(expect.any(String));
    expect(captured.requestId.length).toBeGreaterThan(0);
  });

  it('captures the first forwarded address and the user agent', () => {
    const { captured } = run({
      'x-forwarded-for': '198.51.100.7, 198.51.100.8',
      'user-agent': 'jest-agent',
    });

    expect(captured.ipAddress).toBe('198.51.100.7');
    expect(captured.userAgent).toBe('jest-agent');
  });

  it('falls back to the socket address when no proxy header exists', () => {
    const { captured } = run({}, { ip: undefined, socket: { remoteAddress: '192.0.2.5' } });

    expect(captured.ipAddress).toBe('192.0.2.5');
  });
});
