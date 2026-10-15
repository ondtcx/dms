import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../auth/role.enum';
import { resolveEffectiveRoleKeys } from '../role/compatibility-resolver';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

jest.mock('bcrypt', () => ({ __esModule: true, default: { hash: jest.fn().mockResolvedValue('hashed') } }));

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('catalog creation', () => {
    const input = { name: 'Inspector', email: 'inspector@example.com', password: 'Password123!', catalogRoleId: 12 };
    const role = { id: 12, key: 'inspector-general', label: 'Inspector General', isActive: true, legacyRole: null };
    let tx: any;
    let prisma: any;

    beforeEach(() => {
      tx = {
        role: { findUnique: jest.fn().mockResolvedValue(role) },
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user', role: 'user', roleAssignments: [{ role }] }) },
      };
      prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      service = new UserService(prisma);
    });

    it('creates the assignment atomically and never inherits profesor', async () => {
      const result = await service.create(input as any);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
      expect(tx.user.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          email: input.email,
          password: 'hashed',
          role: 'user',
          roleAssignments: { create: { roleId: 12 } },
        },
        select: expect.objectContaining({ roleAssignments: expect.any(Object) }),
      });
      expect(result.catalogRoles).toEqual([role]);
      expect(resolveEffectiveRoleKeys(result.role, result.catalogRoles!)).toEqual(['user', 'inspector-general']);
      expect(result).not.toHaveProperty('password');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('ignores a supplied legacy profesor role when selecting a catalog role', async () => {
      await service.create({ ...input, role: UserRole.PROFESOR } as any);
      expect(tx.user.create.mock.calls[0][0].data.role).toBe('user');
    });

    it.each([null, { ...role, isActive: false }])('rejects missing or inactive roles before creating the user', async (selectedRole) => {
      tx.role.findUnique.mockResolvedValue(selectedRole);
      await expect(service.create(input as any)).rejects.toThrow(selectedRole ? ForbiddenException : NotFoundException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5, '12', null, [12, 12]])('rejects invalid and duplicate IDs at the service boundary: %p', async (catalogRoleId) => {
      await expect(service.create({ ...input, catalogRoleId } as any)).rejects.toThrow(BadRequestException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('propagates nested assignment failure without a separate persisted user write', async () => {
      tx.user.create.mockRejectedValue(new Error('Assignment constraint failure'));
      await expect(service.create(input as any)).rejects.toThrow('Assignment constraint failure');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('preserves legacy creation without a catalog selection', async () => {
      prisma.user.create.mockResolvedValue({ id: 'legacy', role: 'profesor', password: 'hashed' });
      const { catalogRoleId, ...legacy } = input;
      await expect(service.create({ ...legacy, role: UserRole.PROFESOR })).resolves.toEqual({ id: 'legacy', role: 'profesor' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('preserves default legacy creation when both role fields are omitted', async () => {
      prisma.user.create.mockResolvedValue({ id: 'legacy', role: 'user', password: 'hashed' });
      const { catalogRoleId, ...legacy } = input;
      await expect(service.create(legacy)).resolves.toEqual({ id: 'legacy', role: 'user' });
      expect(prisma.user.create.mock.calls[0][0].data).not.toHaveProperty('role');
    });

    it('rejects duplicate email before writing either user or assignment', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(input as any)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects creation-only catalog selection on the inherited update DTO', async () => {
      await expect(service.update('existing', { catalogRoleId: 12 } as any)).rejects.toThrow(BadRequestException);
    });
  });

  it('projects catalog roles for list and detail users', async () => {
    const user = {
      id: 'u1',
      role: 'user',
      roleAssignments: [{ role: { id: 4, key: 'editor', label: 'Editor', isActive: true } }],
    };
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([user]), findUnique: jest.fn().mockResolvedValue(user) } };
    service = new UserService(prisma as any);

    await expect(service.findAll()).resolves.toEqual([expect.objectContaining({ catalogRoles: [user.roleAssignments[0].role] })]);
    await expect(service.findById('u1')).resolves.toEqual(expect.objectContaining({ catalogRoles: [user.roleAssignments[0].role] }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ roleAssignments: expect.any(Object) }) }));
  });

  it('projects catalog roles when loading a user for login', async () => {
    const user = {
      id: 'u1',
      email: 'u1@example.com',
      password: 'hashed-password',
      role: 'user',
      roleAssignments: [{ role: { id: 4, key: 'editor', label: 'Editor', isActive: true } }],
    };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    service = new UserService(prisma as any);

    await expect(service.findByEmail(user.email)).resolves.toEqual(
      expect.objectContaining({ catalogRoles: [user.roleAssignments[0].role] }),
    );
  });

  it('returns an empty catalog role projection when login user has no assignments', async () => {
    const user = { id: 'u2', email: 'u2@example.com', password: 'hashed-password', role: 'user', roleAssignments: [] };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    service = new UserService(prisma as any);

    await expect(service.findByEmail(user.email)).resolves.toEqual(expect.objectContaining({ catalogRoles: [] }));
  });
});
