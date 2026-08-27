import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Roles lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const login = async (email: string) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Demo123!' })
      .expect(200);
    return response.body.access_token as string;
  };

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(() => app?.close());

  it('exposes the role lifecycle endpoint', async () => {
    await request(app.getHttpServer()).get('/roles').expect((response) => {
      expect([401, 403, 200]).toContain(response.status);
    });
  });

  it('rejects an unauthorized catalog mutation without writing', async () => {
    const before = await prisma.role.count();
    await request(app.getHttpServer())
      .post('/roles')
      .send({ key: `unauthorized-${randomUUID()}`, label: 'Unauthorized', permissionKeys: [] })
      .expect(401);
    await expect(prisma.role.count()).resolves.toBe(before);
  });

  it('exposes active permission catalog only to roles.manage authorities', async () => {
    const inactive = await prisma.permission.create({
      data: { key: `inactive-${randomUUID()}`, label: 'Inactive runtime permission', isActive: false },
    });

    const response = await request(app.getHttpServer())
      .get('/permissions/catalog')
      .set('Authorization', `Bearer ${await login('admin@colegio.edu')}`)
      .expect(200);

    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'roles.manage', label: expect.any(String) }),
    ]));
    expect(response.body.every((permission) => permission.isActive !== false)).toBe(true);
    expect(response.body.some((permission) => permission.id === inactive.id)).toBe(false);

    await prisma.permission.delete({ where: { id: inactive.id } });
  });

  it('allows an authenticated authority change while another roles.manage user remains', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@colegio.edu' } });
    const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coord.primaria@colegio.edu' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'roles.manage' } });
    const role = await prisma.role.create({ data: { key: `runtime-two-authorities-${randomUUID()}`, label: 'Runtime two authorities' } });

    try {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      await prisma.userRoleAssignment.create({ data: { userId: coordinator.id, roleId: role.id } });

      const authorityCount = await prisma.user.count({
        where: {
          roleAssignments: {
            some: {
              role: { isActive: true, permissions: { some: { permission: { key: 'roles.manage', isActive: true } } } },
            },
          },
        },
      });
      expect(authorityCount).toBeGreaterThanOrEqual(2);

      const response = await request(app.getHttpServer())
        .post(`/roles/${role.id}/deactivate`)
        .set('Authorization', `Bearer ${await login('admin@colegio.edu')}`)
        .expect(201);

      expect(response.body).toMatchObject({ id: role.id, isActive: false });
      await expect(prisma.userRoleAssignment.findUnique({ where: { userId_roleId: { userId: coordinator.id, roleId: role.id } } }))
        .resolves.toMatchObject({ userId: coordinator.id, roleId: role.id });
      await expect(prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).resolves.toMatchObject({ id: admin.id });
    } finally {
      await prisma.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
    }
  });

  it('rejects removing the final authenticated authority atomically', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@colegio.edu' } });
    const coordinator = await prisma.user.findUniqueOrThrow({ where: { email: 'coord.primaria@colegio.edu' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'roles.manage' } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
    const role = await prisma.role.create({ data: { key: `runtime-final-authority-${randomUUID()}`, label: 'Runtime final authority' } });

    try {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      await prisma.userRoleAssignment.create({ data: { userId: coordinator.id, roleId: role.id } });
      await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } } });
      await prisma.user.update({ where: { id: admin.id }, data: { authRevision: { increment: 1 } } });

      const before = await prisma.user.findUniqueOrThrow({ where: { id: coordinator.id } });
      const response = await request(app.getHttpServer())
        .post(`/roles/${role.id}/unassign/${coordinator.id}`)
        .set('Authorization', `Bearer ${await login('coord.primaria@colegio.edu')}`)
        .expect(403);

      expect(response.body.message).toContain('roles.manage authority');
      await expect(prisma.userRoleAssignment.findUnique({ where: { userId_roleId: { userId: coordinator.id, roleId: role.id } } }))
        .resolves.toMatchObject({ userId: coordinator.id, roleId: role.id });
      await expect(prisma.user.findUniqueOrThrow({ where: { id: coordinator.id } }))
        .resolves.toMatchObject({ authRevision: before.authRevision });
    } finally {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: permission.id },
      });
      await prisma.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
    }
  });

  it('returns current catalog-role projections from assignment mutations and users', async () => {
    const adminToken = await login('admin@colegio.edu');
    const target = await prisma.user.findUniqueOrThrow({ where: { email: 'coord.primaria@colegio.edu' } });
    const role = await prisma.role.create({ data: { key: `runtime-projection-${randomUUID()}`, label: 'Runtime projection' } });

    try {
      const assigned = await request(app.getHttpServer())
        .post(`/roles/${role.id}/assign/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(assigned.body).toMatchObject({ id: target.id });
      expect(assigned.body.catalogRoles).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: role.id, key: role.key })]),
      );

      const listed = await request(app.getHttpServer()).get('/users').set('Authorization', `Bearer ${adminToken}`).expect(200);
      expect(listed.body.find((user) => user.id === target.id).catalogRoles).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: role.id })]),
      );

      const removed = await request(app.getHttpServer())
        .post(`/roles/${role.id}/unassign/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      expect(removed.body).toMatchObject({ id: target.id });
      expect(removed.body.catalogRoles).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: role.id })]),
      );
    } finally {
      await prisma.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
    }
  });

  it('allows a dynamic roles.manage user to browse users while denying an ordinary user', async () => {
    const dynamicUser = await prisma.user.findUniqueOrThrow({ where: { email: 'coord.primaria@colegio.edu' } });
    const target = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@colegio.edu' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'roles.manage' } });
    const role = await prisma.role.create({ data: { key: `runtime-users-${randomUUID()}`, label: 'Runtime users manager' } });

    try {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      await prisma.userRoleAssignment.create({ data: { userId: dynamicUser.id, roleId: role.id } });

      const dynamicToken = await login(dynamicUser.email);
      await request(app.getHttpServer()).get('/users').set('Authorization', `Bearer ${dynamicToken}`).expect(200);
      await request(app.getHttpServer()).get(`/users/${target.id}`).set('Authorization', `Bearer ${dynamicToken}`).expect(200);

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${await login('maestro.1p@colegio.edu')}`)
        .expect(403);
    } finally {
      await prisma.userRoleAssignment.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
    }
  });
});
