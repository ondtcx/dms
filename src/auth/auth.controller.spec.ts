import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ALLOW_PENDING_2FA_KEY } from './decorators/allow-pending-2fa.decorator';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('pending 2FA allowlist', () => {
    const allowed = [
      'logout',
      'getTotpStatus',
      'setupTotp',
      'enableTotp',
      'getProfile',
    ];
    const denied = [
      'disableTotp',
      'register',
      'generateResetToken',
      'changePassword',
    ];

    it.each(allowed)('allows %s while enrollment is pending', (method) => {
      expect(
        Reflect.getMetadata(
          ALLOW_PENDING_2FA_KEY,
          (AuthController.prototype as any)[method],
        ),
      ).toBe(true);
    });

    it.each(denied)('does not allow %s while enrollment is pending', (method) => {
      expect(
        Reflect.getMetadata(
          ALLOW_PENDING_2FA_KEY,
          (AuthController.prototype as any)[method],
        ),
      ).toBeUndefined();
    });
  });
});
