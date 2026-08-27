import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './compatibility/authorization.service';
import { AuthenticatedProfile } from './auth.service';

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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
    service = new AuthService(userService as any, {} as any, {} as any, authorization as any);

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
