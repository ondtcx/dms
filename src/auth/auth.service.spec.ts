import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, generateTotpSecret, verifyTotp } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './compatibility/authorization.service';
import { AuthenticatedProfile } from './auth.service';
import { SettingsService } from '../settings/settings.service';
import { NotFoundException } from '@nestjs/common';

describe('TOTP primitives', () => {
  it('generates valid base32 secrets and accepts only current or adjacent time steps', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59000)).toBe(true);
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 120000)).toBe(false);
    expect(verifyTotp(secret, 'invalid')).toBe(false);
  });
});

describe('TOTP flows', () => {
  it('creates a pending setup and rejects invalid enable codes', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ email: 'a@b.test', totpEnabled: false, totpPendingSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' }), update: jest.fn() } };
    const service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any);
    await expect(service.setupTotp('u1')).resolves.toEqual(expect.objectContaining({ secret: expect.any(String), otpauthUri: expect.stringContaining('otpauth://totp/') }));
    await expect(service.enableTotp('u1', '000000')).rejects.toThrow('Código inválido');
  });

  it('returns a machine-readable challenge after a correct password without a code', async () => {
    const user = { id: 'u1', email: 'a@b.test', password: 'hash', role: 'user', lockedUntil: null, totpEnabled: true, totpSecret: 'invalid', totpRecoveryCodeHashes: [] };
    const service = new AuthService({ findByEmail: jest.fn().mockResolvedValue(user) } as any, {} as any, { user: { update: jest.fn() } } as any, {} as any, {} as any);
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
    await expect(service.login({ email: user.email, password: 'correct' })).rejects.toMatchObject({
      status: 401,
      response: { code: 'TWO_FACTOR_REQUIRED' },
    });
  });

  it('uses the generic invalid-credentials response for an unknown email', async () => {
    const userService = { findByEmail: jest.fn().mockRejectedValue(new NotFoundException('User not found')) };
    const service = new AuthService(userService as any, {} as any, {} as any, {} as any, {} as any);

    await expect(service.login({ email: 'unknown@example.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      response: { message: 'Credenciales inválidas' },
    });
  });

  it('rejects an invalid TOTP disable code as a client input error', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          totpEnabled: true,
          totpSecret: 'invalid',
          totpRecoveryCodeHashes: [],
        }),
      },
      $transaction: jest.fn().mockImplementation((callback: any) => callback({
        user: { findUnique: jest.fn().mockResolvedValue({ totpRecoveryCodeHashes: [] }) },
      })),
    };
    const service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any);

    await expect(service.disableTotp('u1', '000000')).rejects.toMatchObject({
      status: 400,
      response: { message: 'Código inválido' },
    });
  });

  it('consumes a recovery code once when concurrent disable requests are serialized', async () => {
    let hashes = ['hash'];
    let queue = Promise.resolve();
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          totpEnabled: true,
          totpSecret: 'invalid',
          totpRecoveryCodeHashes: hashes,
        }),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: any) => {
        const run = queue.then(() => callback({
          user: {
            findUnique: jest.fn().mockResolvedValue({ totpRecoveryCodeHashes: hashes }),
            update: jest.fn().mockImplementation(({ data }) => { hashes = data.totpRecoveryCodeHashes; }),
          },
        }));
        queue = run.then(() => undefined);
        return run;
      }),
    };
    const service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any);
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

    await expect(Promise.allSettled([
      service.disableTotp('u1', 'recovery'),
      service.disableTotp('u1', 'recovery'),
    ])).resolves.toEqual([
      { status: 'fulfilled', value: { enabled: false } },
      { status: 'rejected', reason: expect.objectContaining({ status: 400 }) },
    ]);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        { provide: AuthorizationService, useValue: {} },
        { provide: SettingsService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('increments authRevision atomically when changing a password', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u1', password: 'current' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuthService(
      {} as any,
      {} as any,
      prisma as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
    jest.spyOn(require('bcrypt'), 'hash').mockResolvedValue('hashed');

    await service.changePassword('u1', 'current', 'new-password');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: 'hashed', authRevision: { increment: 1 } },
    });
  });

  it('increments authRevision with password and consumes reset token atomically', async () => {
    const transaction = jest.fn().mockResolvedValue([]);
    const prisma = {
      passwordResetToken: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          userId: 'u1',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: jest.fn().mockReturnValue({}),
      },
      user: { update: jest.fn().mockReturnValue({}) },
      $transaction: transaction,
    };
    service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any);
    jest.spyOn(require('bcrypt'), 'hash').mockResolvedValue('hashed');

    await service.resetPassword('reset-token', 'new-password');

    expect(transaction).toHaveBeenCalledWith([
      expect.objectContaining({}),
      expect.objectContaining({}),
    ]);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: 'hashed', authRevision: { increment: 1 } },
    });
  });

  it('locks an existing account at the configured failed-attempt threshold', async () => {
    const user = { id: 'u1', email: 'u1@example.com', password: 'hash', role: 'user', failedLoginAttempts: 4, lockedUntil: null };
    const prisma = { user: { updateMany: jest.fn()
      .mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }), update: jest.fn() } };
    const userService = { findByEmail: jest.fn().mockResolvedValue(user) };
    const authorization = { getAuthorization: jest.fn() };
    const settings = { getMaxLoginAttempts: jest.fn().mockResolvedValue(5) };
    service = new AuthService(userService as any, {} as any, prisma as any, authorization as any, settings as any);
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow('Credenciales inválidas');
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.user.updateMany.mock.calls[0][0].data.failedLoginAttempts).toEqual({ increment: 1 });
  });

  it('clears an expired lock before counting a new failed password', async () => {
    const user = { id: 'u1', email: 'u1@example.com', password: 'hash', role: 'user', failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) };
    const prisma = { user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const userService = { findByEmail: jest.fn().mockResolvedValue(user) };
    const settings = { getMaxLoginAttempts: jest.fn().mockResolvedValue(5) };
    const service = new AuthService(userService as any, {} as any, prisma as any, {} as any, settings as any);
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);
    await expect(service.login({ email: user.email, password: 'wrong' })).rejects.toThrow('Credenciales inválidas');
    expect(prisma.user.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { lockedUntil: null, failedLoginAttempts: 0 } }));
    expect(prisma.user.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { failedLoginAttempts: { increment: 1 } } }));
  });

  it('retries serialization conflicts without reusing recovery codes', async () => {
    const conflict = Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    const prisma = { $transaction: jest.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce(false) };
    const service = new AuthService({} as any, {} as any, prisma as any, {} as any, {} as any);
    await expect((service as any).consumeRecoveryCode('u1', 'recovery')).resolves.toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('resets lockout state after a successful login', async () => {
    const user = { id: 'u1', email: 'u1@example.com', password: 'hash', role: 'user', failedLoginAttempts: 2, lockedUntil: null };
    const prisma = { user: { update: jest.fn().mockResolvedValue({}), } };
    const userService = { findByEmail: jest.fn().mockResolvedValue(user) };
    const authorization = { getAuthorization: jest.fn().mockResolvedValue({ roles: [], permissions: [], authRevision: 0 }) };
    service = new AuthService(userService as any, { signAsync: jest.fn().mockResolvedValue('token') } as any, prisma as any, authorization as any, { getMaxLoginAttempts: jest.fn() } as any);
    jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);

    const response = await service.login({ email: user.email, password: 'correct' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { failedLoginAttempts: 0, lockedUntil: null, lastActivityAt: expect.any(Date) } }));
    expect(response.user).not.toHaveProperty('lastActivityAt');
    expect(response.user).not.toHaveProperty('failedLoginAttempts');
    expect(response.user).not.toHaveProperty('lockedUntil');
  });

  it('returns profile authorization in the same shape used by login', async () => {
    const userService = {
      findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'u1@example.com', role: 'user' }),
    };
    const authorization = {
      getAuthorization: jest.fn().mockResolvedValue({
        roles: ['user'], permissions: ['documents.read'], authRevision: 4,
      }),
    };
    service = new AuthService(userService as any, {} as any, {} as any, authorization as any, {} as any);

    const profile: AuthenticatedProfile = await service.getProfile('u1');

    expect(profile).toEqual({
      user: { id: 'u1', email: 'u1@example.com', role: 'user' },
      roles: ['user'],
      permissions: ['documents.read'],
      authRevision: 4,
    });
    expect(profile.user.id).toBe('u1');
  });
});
