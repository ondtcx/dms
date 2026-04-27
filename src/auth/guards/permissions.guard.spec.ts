import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';
import { RoleService } from '../../role/role.service';
import { ExecutionContext } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let roleService: RoleService;

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const mockRoleService = {
      getRolePermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: RoleService, useValue: mockRoleService },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
    roleService = module.get<RoleService>(RoleService);
  });

  it('should allow access if no permissions are required', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);

    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('should deny access if user is not present in request', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['users:read']);

    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: null }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(false);
  });

  it('should deny access if user has no roleId', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['users:read']);

    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: '1' } }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(false);
  });

  it('should allow access if user has the required permissions', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['users:read']);
    (roleService.getRolePermissions as jest.Mock).mockResolvedValue(['users:read', 'users:write']);

    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: '1', roleId: 'role1' } }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(roleService.getRolePermissions).toHaveBeenCalledWith('role1');
  });

  it('should deny access if user lacks required permissions', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['users:write']);
    (roleService.getRolePermissions as jest.Mock).mockResolvedValue(['users:read']);

    const mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: '1', roleId: 'role1' } }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(false);
  });
});