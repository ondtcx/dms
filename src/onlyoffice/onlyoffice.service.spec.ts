import { ConfigService } from '@nestjs/config';
import { OnlyofficeService } from './onlyoffice.service';

describe('OnlyofficeService.checkHealth', () => {
  let service: OnlyofficeService;
  let config: { get: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = {
      get: jest.fn(),
    };
    service = new OnlyofficeService(
      config as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('returns unavailable when ONLYOFFICE_URL is not configured', async () => {
    config.get.mockReturnValue(undefined);

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns unavailable when ONLYOFFICE_URL is malformed', async () => {
    config.get.mockReturnValue('not-a-url');

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns available when the healthcheck responds with 200', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await expect(service.checkHealth()).resolves.toEqual({ available: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://onlyoffice.test/healthcheck',
      {
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('returns unavailable for other 2xx statuses (201/204)', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
  });

  it('returns unavailable when the healthcheck responds with a non-200 status', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(service.checkHealth()).resolves.toEqual({ available: false });
  });

  it('returns unavailable when the healthcheck times out after 3000ms', async () => {
    jest.useFakeTimers();
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new Error('upstream timeout')),
          );
        }),
    );

    const healthcheck = service.checkHealth();
    await jest.advanceTimersByTimeAsync(3000);

    await expect(healthcheck).resolves.toEqual({ available: false });
  });

  it('does not expose upstream errors in the response', async () => {
    config.get.mockReturnValue('http://onlyoffice.test');
    fetchMock.mockRejectedValue(new Error('database credentials leaked'));

    const result = await service.checkHealth();

    expect(result).toEqual({ available: false });
    expect(result).not.toHaveProperty('error');
  });
});
