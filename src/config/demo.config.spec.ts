import { getDemoConfig } from './demo.config';

describe('demo configuration', () => {
  it('enables demo only for the exact value 1', () => {
    expect(getDemoConfig({ DEMO_MODE: 'true' }).enabled).toBe(false);
    expect(getDemoConfig({}).enabled).toBe(false);
    expect(getDemoConfig({ DEMO_MODE: '1', DEMO_FRONTEND_ORIGIN: 'http://localhost:3100' })).toEqual({
      enabled: true,
      frontendOrigin: 'http://localhost:3100',
    });
  });

  it('requires an explicit loopback HTTP origin with a port', () => {
    expect(getDemoConfig({ DEMO_MODE: '1', DEMO_FRONTEND_ORIGIN: 'http://127.0.0.1:3100' }).frontendOrigin)
      .toBe('http://127.0.0.1:3100');
    for (const origin of ['', 'http://localhost', 'https://localhost:3100', 'http://example.com:3100', 'http://localhost:0', 'http://localhost:65536', 'http://localhost:3100/path', 'http://user@localhost:3100', 'http://localhost:3100?x=1']) {
      expect(() => getDemoConfig({ DEMO_MODE: '1', DEMO_FRONTEND_ORIGIN: origin })).toThrow();
    }
  });
});
