const app = {
  enableShutdownHooks: jest.fn(), get: jest.fn(), setGlobalPrefix: jest.fn(),
  enableCors: jest.fn(), useGlobalPipes: jest.fn(), listen: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@nestjs/core', () => ({ NestFactory: { create: jest.fn(async () => app) } }));
jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));
jest.mock('./storage/reception-file.middleware', () => ({ installReceptionFileProtection: jest.fn() }));
jest.mock('@nestjs/swagger', () => {
  const builder: any = {};
  for (const name of ['setTitle', 'setDescription', 'setVersion', 'addTag', 'addBearerAuth']) builder[name] = () => builder;
  builder.build = () => ({});
  return { DocumentBuilder: jest.fn(() => builder), SwaggerModule: { createDocument: jest.fn(() => ({})), setup: jest.fn() } };
});

describe('bootstrap demo behavior', () => {
  const original = { ...process.env };
  afterAll(() => { process.env = original; });
  beforeEach(() => { jest.resetModules(); jest.clearAllMocks(); process.env = { ...original, PORT: '3101' }; });

  it.each([['1', true], ['0', false], [undefined, false]])('mode %s configures demo: %s', async (mode, demo) => {
    if (mode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = mode;
    process.env.DEMO_FRONTEND_ORIGIN = 'http://127.0.0.1:3100';
    const { bootstrap } = require('./main');
    await bootstrap();
    const { SwaggerModule } = require('@nestjs/swagger');
    expect(app.enableCors).toHaveBeenCalledWith(expect.objectContaining({ origin: demo
      ? ['http://127.0.0.1:3100']
      : ['http://localhost:3000', 'http://localhost:8080', 'http://host.docker.internal', 'http://host.docker.internal:3001'] }));
    expect(app.listen).toHaveBeenCalledWith(...(demo ? ['3101', '127.0.0.1'] : ['3101']));
    expect(SwaggerModule.setup).toHaveBeenCalledTimes(demo ? 0 : 1);
  });

  it('rejects a missing demo origin before creating an application', async () => {
    process.env.DEMO_MODE = '1';
    delete process.env.DEMO_FRONTEND_ORIGIN;
    const { bootstrap } = require('./main');
    const { NestFactory } = require('@nestjs/core');
    await expect(bootstrap()).rejects.toThrow('DEMO_FRONTEND_ORIGIN');
    expect(NestFactory.create).not.toHaveBeenCalled();
  });
});
