import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth.guard';
import { SettingsService } from '../../settings/settings.service';
import { ALLOW_PENDING_2FA_KEY } from '../decorators/allow-pending-2fa.decorator';

describe('AuthGuard migration compatibility', () => {
  const request = (authorization = 'Bearer token') => ({ headers: { authorization } });
  const context = (req: any): ExecutionContext => ({
    getHandler: jest.fn(), getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => req }),
  } as any);

  it('accepts a claimless token only while the account is at the initial revision', async () => {
    const req: any = request();
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', role: 'admin' }) } as unknown as JwtService,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector,
      { get: jest.fn().mockReturnValue('secret') } as unknown as ConfigService,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 0, role: 'admin', email: 'a@b.c', name: 'A' }), updateMany: jest.fn() } } as any,
      { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: false }) } as unknown as SettingsService,
    );
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.user.authRevision).toBe(0);
  });

  it('rejects a claimless token after the revision moved', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', role: 'admin' }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 1, role: 'admin', isActive: true, lastActivityAt: new Date(), totpEnabled: false }), updateMany: jest.fn() } } as any,
      { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: false }) } as any,
    );
    await expect(guard.canActivate(context(request()))).rejects.toThrow('Invalid token');
  });

  it('rejects an inactive session', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 1 }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 1, role: 'user', lastActivityAt: new Date(Date.now() - 481 * 60_000) }), updateMany: jest.fn() } } as any,
      { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: false }) } as any,
    );
    await expect(guard.canActivate(context(request()))).rejects.toThrow('Invalid token');
  });

  it('rejects a token belonging to a deactivated user', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 2 }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 2, role: 'user', isActive: false }), updateMany: jest.fn() } } as any,
      { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: false }) } as any,
    );
    await expect(guard.canActivate(context(request()))).rejects.toThrow('Invalid token');
  });

  it('rejects a token with a stale revision', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 1 }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      { user: { findUnique: jest.fn().mockResolvedValue({ authRevision: 2, role: 'user' }), updateMany: jest.fn() } } as any,
      { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: false }) } as unknown as SettingsService,
    );
    await expect(guard.canActivate(context(request()))).rejects.toThrow('Invalid token');
  });

  const pendingTwoFactorGuard = (allowPending: boolean) => new AuthGuard(
    { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 2 }) } as any,
    { getAllAndOverride: jest.fn().mockImplementation((key) => key === ALLOW_PENDING_2FA_KEY && allowPending) } as any,
    { get: jest.fn().mockReturnValue('secret') } as any,
    {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          authRevision: 2,
          role: 'user',
          isActive: true,
          lastActivityAt: new Date(),
          totpEnabled: false,
        }),
        updateMany: jest.fn(),
      },
    } as any,
    { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: true }) } as any,
  );

  it('blocks a user who still must enroll in 2FA', async () => {
    const guard = pendingTwoFactorGuard(false);
    await expect(guard.canActivate(context(request()))).rejects.toMatchObject({
      response: { code: 'TWO_FACTOR_SETUP_REQUIRED' },
    });
  });

  it('allows an enrollment route for a user who still must configure 2FA', async () => {
    const guard = pendingTwoFactorGuard(true);
    await expect(guard.canActivate(context(request()))).resolves.toBe(true);
  });

  it('does not restrict an enrolled user when 2FA is required globally', async () => {
    const guard = new AuthGuard(
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1', authRevision: 2 }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(false) } as any,
      { get: jest.fn().mockReturnValue('secret') } as any,
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            authRevision: 2,
            role: 'user',
            isActive: true,
            lastActivityAt: new Date(),
            totpEnabled: true,
          }),
          updateMany: jest.fn(),
        },
      } as any,
      { getAuthPolicy: jest.fn().mockResolvedValue({ sessionTimeoutMinutes: 480, require2FA: true }) } as any,
    );
    await expect(guard.canActivate(context(request()))).resolves.toBe(true);
  });
});
