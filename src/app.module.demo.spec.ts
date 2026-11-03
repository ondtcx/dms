import 'reflect-metadata';

jest.mock('@nestjs/config', () => ({ ConfigModule: { forRoot: jest.fn(() => class ConfigRoot {}) } }));

describe('AppModule demo imports', () => {
  const oldMode = process.env.DEMO_MODE;
  const oldOrigin = process.env.DEMO_FRONTEND_ORIGIN;
  afterAll(() => {
    if (oldMode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = oldMode;
    if (oldOrigin === undefined) delete process.env.DEMO_FRONTEND_ORIGIN; else process.env.DEMO_FRONTEND_ORIGIN = oldOrigin;
  });

  it.each([['1', false], ['0', true], [undefined, true]])('mode %s includes integrations: %s', (mode, included) => {
    if (mode === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = mode;
    process.env.DEMO_FRONTEND_ORIGIN = 'http://localhost:3100';
    jest.resetModules();
    const { AppModule } = require('./app.module');
    const imports = Reflect.getMetadata('imports', AppModule);
    expect(imports.some((entry: any) => entry.name === 'TasksModule')).toBe(included);
    expect(imports.some((entry: any) => entry.name === 'OnlyofficeModule')).toBe(included);
  });
});
