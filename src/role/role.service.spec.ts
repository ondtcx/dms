import { Test, TestingModule } from '@nestjs/testing';
import { RoleService } from './role.service';
import { PrismaService } from '../prisma/prisma.service';

describe('RoleService', () => {
  let service: RoleService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const mockPrisma = {
      permission: {
        findMany: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('getRolePermissions', () => {
    it('should fetch from database on first call and cache the result', async () => {
      const mockRole = {
        id: 'role1',
        permissions: [{ action: 'read' }, { action: 'write' }],
      };
      
      (prismaService.role.findUnique as jest.Mock).mockResolvedValue(mockRole);

      const result1 = await service.getRolePermissions('role1');
      expect(result1).toEqual(['read', 'write']);
      expect(prismaService.role.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaService.role.findUnique).toHaveBeenCalledWith({
        where: { id: 'role1' },
        include: { permissions: true },
      });

      // Second call should return cached result without calling Prisma again
      const result2 = await service.getRolePermissions('role1');
      expect(result2).toEqual(['read', 'write']);
      expect(prismaService.role.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if role is not found', async () => {
      (prismaService.role.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getRolePermissions('non-existent');
      expect(result).toEqual([]);
    });

    it('should clear cache and fetch from DB again after clearCache is called', async () => {
      const mockRole = {
        id: 'role1',
        permissions: [{ action: 'read' }],
      };
      
      (prismaService.role.findUnique as jest.Mock).mockResolvedValue(mockRole);

      await service.getRolePermissions('role1');
      expect(prismaService.role.findUnique).toHaveBeenCalledTimes(1);

      service.clearCache('role1');

      await service.getRolePermissions('role1');
      expect(prismaService.role.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRole', () => {
    it('should create a role and connect requested permissions', async () => {
      (prismaService.permission.findMany as jest.Mock).mockResolvedValue([
        { id: 'perm-1', action: 'role:admin' },
        { id: 'perm-2', action: 'documents:read:all' },
      ]);
      (prismaService.role.create as jest.Mock).mockResolvedValue({
        id: 'role-1',
        name: 'custom_admin',
        permissions: [
          { id: 'perm-1', action: 'role:admin' },
          { id: 'perm-2', action: 'documents:read:all' },
        ],
      });

      const result = await service.createRole({
        name: 'custom_admin',
        description: 'Rol personalizado',
        permissionActions: ['role:admin', 'documents:read:all'],
      });

      expect(prismaService.permission.findMany).toHaveBeenCalledWith({
        where: {
          action: {
            in: ['role:admin', 'documents:read:all'],
          },
        },
      });
      expect(prismaService.role.create).toHaveBeenCalledWith({
        data: {
          name: 'custom_admin',
          description: 'Rol personalizado',
          permissions: {
            connect: [{ id: 'perm-1' }, { id: 'perm-2' }],
          },
        },
        include: { permissions: true },
      });
      expect(result.name).toBe('custom_admin');
      expect(result.permissions).toHaveLength(2);
    });
  });

  describe('assignRoleToUser', () => {
    it('should assign role to user and clear permission cache for that role', async () => {
      (prismaService.user.update as jest.Mock).mockResolvedValue({
        id: 'user-1',
        roleId: 'role-1',
      });

      const clearCacheSpy = jest.spyOn(service, 'clearCache');

      const result = await service.assignRoleToUser('user-1', 'role-1');

      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { roleId: 'role-1' },
      });
      expect(clearCacheSpy).toHaveBeenCalledWith('role-1');
      expect(result.roleId).toBe('role-1');
    });
  });
});
