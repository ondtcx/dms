import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';

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
