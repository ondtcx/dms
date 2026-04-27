import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RoleService } from '../src/role/role.service';

describe('Role lifecycle (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let roleService: RoleService;

  const roles = new Map([
    [
      'admin-role',
      {
        id: 'admin-role',
        name: 'admin',
        description: 'Rol administrador',
        isSystem: true,
        permissions: [
          { id: 'perm-role-admin', action: 'role:admin' },
          { id: 'perm-roles-read', action: 'roles:read' },
          { id: 'perm-roles-write', action: 'roles:write' },
        ],
      },
    ],
  ]);

  const permissions = new Map([
    ['role:admin', { id: 'perm-role-admin', action: 'role:admin' }],
    ['roles:read', { id: 'perm-roles-read', action: 'roles:read' }],
    ['roles:write', { id: 'perm-roles-write', action: 'roles:write' }],
  ]);

  const users = new Map([
    [
      'user-1',
      {
        id: 'user-1',
        email: 'user1@example.com',
        name: 'Usuario Uno',
        roleId: null,
        role: null,
        departmentId: null,
        phoneNumber: null,
        position: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  ]);

  const mockPrismaService = {
    role: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; name?: string } }) => {
          if (where.id) {
            return Promise.resolve(roles.get(where.id) ?? null);
          }

          if (where.name) {
            return Promise.resolve(
              Array.from(roles.values()).find(
                (role) => role.name === where.name,
              ) ?? null,
            );
          }

          return Promise.resolve(null);
        },
      ),
      findMany: jest.fn(() => Promise.resolve(Array.from(roles.values()))),
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            name: string;
            description?: string;
            permissions?: { connect: Array<{ id: string }> };
          };
        }) => {
          const createdRole = {
            id: 'custom-role',
            name: data.name,
            description: data.description ?? null,
            isSystem: false,
            permissions: (data.permissions?.connect ?? []).map(({ id }) => {
              const permission = Array.from(permissions.values()).find(
                (entry) => entry.id === id,
              );
              if (!permission) {
                throw new Error(`Permission ${id} not found in mock store`);
              }

              return permission;
            }),
          };

          roles.set(createdRole.id, createdRole);
          return Promise.resolve(createdRole);
        },
      ),
    },
    permission: {
      findMany: jest.fn(
        ({ where }: { where: { action: { in: string[] } } }) => {
          return Promise.resolve(
            where.action.in
              .map((action) => permissions.get(action))
              .filter(
                (permission): permission is { id: string; action: string } =>
                  Boolean(permission),
              ),
          );
        },
      ),
    },
    user: {
      findUnique: jest.fn(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) {
            return Promise.resolve(users.get(where.id) ?? null);
          }

          if (where.email) {
            return Promise.resolve(
              Array.from(users.values()).find(
                (user) => user.email === where.email,
              ) ?? null,
            );
          }

          return Promise.resolve(null);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { roleId?: string | null };
        }) => {
          const existingUser = users.get(where.id);

          if (!existingUser) {
            return Promise.resolve(null);
          }

          const updatedUser = {
            ...existingUser,
            roleId: data.roleId ?? null,
            role: data.roleId ? (roles.get(data.roleId) ?? null) : null,
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          };

          users.set(where.id, updatedUser);
          return Promise.resolve(updatedUser);
        },
      ),
    },
    category: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 99, name: 'Nueva Categoría' }),
    },
  };

  const signToken = (userId: string, roleId: string | null) =>
    jwtService.sign({
      sub: userId,
      email: `${userId}@example.com`,
      name: userId,
      roleId,
      role: roleId ? (roles.get(roleId)?.name ?? null) : null,
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = app.get(JwtService);
    roleService = app.get(RoleService);
  });

  beforeEach(() => {
    roleService.clearCache();
    jest.clearAllMocks();

    roles.clear();
    roles.set('admin-role', {
      id: 'admin-role',
      name: 'admin',
      description: 'Rol administrador',
      isSystem: true,
      permissions: [
        { id: 'perm-role-admin', action: 'role:admin' },
        { id: 'perm-roles-read', action: 'roles:read' },
        { id: 'perm-roles-write', action: 'roles:write' },
      ],
    });

    users.set('user-1', {
      id: 'user-1',
      email: 'user1@example.com',
      name: 'Usuario Uno',
      roleId: null,
      role: null,
      departmentId: null,
      phoneNumber: null,
      position: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should expose GET /role with the frontend contract shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/role')
      .set('Authorization', `Bearer ${signToken('admin-1', 'admin-role')}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'admin-role',
        name: 'admin',
        isSystem: true,
        permissions: expect.arrayContaining([
          expect.objectContaining({ action: 'roles:read' }),
        ]),
      }),
    ]);
  });

  it('should create a role, assign it to a user, and allow that user to access a guarded route', async () => {
    const adminToken = signToken('admin-1', 'admin-role');
    const unauthorizedToken = signToken('user-1', null);

    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .send({ name: 'Sin permiso' })
      .expect(403);

    const createRoleResponse = await request(app.getHttpServer())
      .post('/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'category_admin',
        description: 'Puede administrar categorías',
        permissionActions: ['role:admin'],
      })
      .expect(201);

    expect(createRoleResponse.body).toEqual(
      expect.objectContaining({
        id: 'custom-role',
        name: 'category_admin',
        isSystem: false,
        permissions: [{ id: 'perm-role-admin', action: 'role:admin' }],
      }),
    );

    const assignRoleResponse = await request(app.getHttpServer())
      .patch('/users/user-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: 'custom-role' })
      .expect(200);

    expect(assignRoleResponse.body).toEqual(
      expect.objectContaining({
        id: 'user-1',
        roleId: 'custom-role',
        role: expect.objectContaining({ name: 'category_admin' }),
      }),
    );

    const authorizedToken = signToken('user-1', 'custom-role');

    const guardedResponse = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${authorizedToken}`)
      .send({ name: 'Con permiso' })
      .expect(201);

    expect(guardedResponse.body).toEqual(
      expect.objectContaining({
        id: 99,
        name: 'Nueva Categoría',
      }),
    );
  });
});
