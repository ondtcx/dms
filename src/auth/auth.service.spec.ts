import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { RoleService } from '../role/role.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let userService: UserService;
  let jwtService: JwtService;
  let roleService: RoleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
        {
          provide: RoleService,
          useValue: {
            getRolePermissions: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
    roleService = module.get<RoleService>(RoleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should include permissions in the jwt payload and response', async () => {
      // Arrange
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        password: await bcrypt.hash('password123', 10),
        name: 'Test User',
        roleId: 1,
        role: { id: 1, name: 'admin' },
      };
      const mockPermissions = ['users:read', 'users:write'];
      const mockToken = 'mocked.jwt.token';

      (userService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      (roleService.getRolePermissions as jest.Mock).mockResolvedValue(
        mockPermissions,
      );
      (jwtService.signAsync as jest.Mock).mockResolvedValue(mockToken);

      // Act
      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      // Assert
      expect(roleService.getRolePermissions).toHaveBeenCalledWith(
        mockUser.roleId,
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          permissions: mockPermissions,
          role: 'admin',
          roleId: 1,
        }),
      );
      expect(result.user).toHaveProperty('permissions', mockPermissions);
    });

    it('should keep roleId in the jwt payload even when the role has no permissions', async () => {
      const mockUser = {
        id: '2',
        email: 'viewer@example.com',
        password: await bcrypt.hash('password123', 10),
        name: 'Viewer User',
        roleId: 'role-viewer',
        role: { id: 'role-viewer', name: 'viewer' },
      };
      const mockToken = 'viewer.jwt.token';

      (userService.findByEmail as jest.Mock).mockResolvedValue(mockUser);
      (roleService.getRolePermissions as jest.Mock).mockResolvedValue([]);
      (jwtService.signAsync as jest.Mock).mockResolvedValue(mockToken);

      const result = await service.login({
        email: 'viewer@example.com',
        password: 'password123',
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          roleId: 'role-viewer',
          permissions: [],
          role: 'viewer',
        }),
      );
      expect(result.user).toEqual(
        expect.objectContaining({
          roleId: 'role-viewer',
          permissions: [],
        }),
      );
    });
  });
});
