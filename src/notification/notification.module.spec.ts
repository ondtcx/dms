import { ExecutionContext, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationController } from './notification.controller';
import { NotificationModule } from './notification.module';

const jwt = { verifyAsync: jest.fn() };

// JWT y Config son globales en la aplicación; Settings no lo es. No se añade
// SettingsService al módulo de prueba para ocultar un import faltante.
@Global()
@Module({
  providers: [
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { get: jest.fn() } },
  ],
  exports: [JwtService, ConfigService],
})
class GlobalAuthDependenciesModule {}

describe('NotificationModule authentication scope', () => {
  it('resolves the real controller guard and uses imported session settings', async () => {
    const settings = { getSessionTimeoutMinutes: jest.fn().mockResolvedValue(30) };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'user', authRevision: 0, lastActivityAt: new Date() }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt.verifyAsync.mockResolvedValue({ sub: 'actor' });
    const module = await Test.createTestingModule({
      imports: [GlobalAuthDependenciesModule, NotificationModule],
    })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(SettingsService).useValue(settings)
      .compile();

    try {
      const guard = module.get(AuthGuard, { strict: false });
      const request: any = { headers: { authorization: 'Bearer test-token' } };
      const context = {
        getHandler: () => NotificationController.prototype.list,
        getClass: () => NotificationController,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(settings.getSessionTimeoutMinutes).toHaveBeenCalledTimes(1);
      expect(request.user.id).toBe('actor');
      expect(module.get(NotificationController)).toBeInstanceOf(NotificationController);
    } finally {
      await module.close();
    }
  });
});
