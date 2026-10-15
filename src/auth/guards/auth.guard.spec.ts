import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth.guard';
import { SettingsService } from '../../settings/settings.service';

describe('AuthGuard migration compatibility', () => {
  const request = (authorization = 'Bearer token') => ({ headers: { authorization } });
  const context = (req: any): ExecutionContext => ({
    getHandler: jest.fn(), getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => req }),
  } as any);

  it('accepts a valid claimless token and attaches current authorization state', async () => {
    const req: any = request();
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', role: 'admin' }) } as unknown as JwtService,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      { get: jest.fn().mockReturnValue('secret') } as unknown as ConfigService,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 3, role: 'admin', email: 'a@b.c', name: 'A' }), updateMany: jest.fn() } } as any,
      { getSessionTimeoutMinutes: jest.fn().mockResolvedValue(480) } as unknown as SettingsService,
    );
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.user.authRevision).toBe(3);
  });

  it('rejects an inactive session', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 1 }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 1, role: 'user', lastActivityAt: new Date(Date.now() - 481 * 60_000) }), updateMany: jest.fn() } } as any,
      { getSessionTimeoutMinutes: jest.fn().mockResolvedValue(480) } as any,
    );
    await expect(guard.canActivate(context(request()))).rejects.toThrow('Invalid token');
  });

  it('rejects a token with a stale revision', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 1 }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 2, role: 'user' }), updateMany: jest.fn() } } as any,
      { getSessionTimeoutMinutes: jest.fn().mockResolvedValue(480) } as unknown as SettingsService,
    );
    await expect(guard.canActivate(context(request()))).rejects.toThrow('Invalid token');
  });
});
