import { readFileSync } from 'fs';
import { join } from 'path';
import { installReceptionFileProtection, receptionFileMiddleware } from './reception-file.middleware';

describe('reception-file shared static middleware', () => {
  const policy = { denies: jest.fn() };
  const response = { setHeader: jest.fn(), status: jest.fn(), end: jest.fn() };
  const next = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    response.status.mockReturnValue(response);
  });

  it.each(['GET', 'HEAD', 'POST', 'OPTIONS'])('denies every static request method %s without delegating', async (method) => {
    policy.denies.mockResolvedValue(true);
    await receptionFileMiddleware(policy)({ method, url: '/current.pdf?x=1' } as any, response as any, next);
    expect(policy.denies).toHaveBeenCalledWith('/current.pdf?x=1');
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('passes unprotected assets to the existing static handler unchanged', async () => {
    policy.denies.mockResolvedValue(false);
    await receptionFileMiddleware(policy)({ url: '/ordinary.pdf' } as any, response as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.end).not.toHaveBeenCalled();
  });

  it('never delegates after a policy rejection', async () => {
    policy.denies.mockRejectedValue(new Error('BD no disponible'));
    await receptionFileMiddleware(policy)({ url: '/ordinary.pdf' } as any, response as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('installs on the actual raw root rather than prefix-dependent Nest middleware', () => {
    const app = { use: jest.fn() };
    installReceptionFileProtection(app as any, policy);
    expect(app.use).toHaveBeenCalledWith('/files', expect.any(Function));
  });

  it('production calls the same installer before initialization and static lifecycle registration', () => {
    const main = readFileSync(join(__dirname, '../main.ts'), 'utf8');
    const module = readFileSync(join(__dirname, '../app.module.ts'), 'utf8');
    const call = main.indexOf('installReceptionFileProtection(app, app.get(ReceptionFilePolicy))');
    expect(call).toBeGreaterThan(main.indexOf('NestFactory.create(AppModule)'));
    expect(call).toBeLessThan(main.indexOf("app.setGlobalPrefix('api')"));
    expect(call).toBeLessThan(main.indexOf('app.listen('));
    expect(main.slice(0, call)).not.toContain('app.init(');
    expect(module).toContain('    ReceptionFileModule,');
    expect(module).toContain("serveRoot: '/files'");
  });
});
