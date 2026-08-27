import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';

describe('Settings centralization runtime compatibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let unauthorizedToken: string;
  let coordinatorToken: string;
  let adminToken: string;
  let adminId: string;
  let coordinatorId: string;
  let userId: string;
  let categoryId: number;
  let documentTypeId: number;
  let templateId: number;
  const runtimeDocumentIds: number[] = [];
  const runtimeRoleIds: number[] = [];
  const runtimeCategoryIds: number[] = [];

  const login = async (email: string) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'Demo123!' })
      .expect(200);
    return response.body.access_token as string;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = module.get(PrismaService);

    const [admin, coordinator, user, category, documentType, template] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: 'admin@colegio.edu' } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'coord.primaria@colegio.edu' } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'maestro.1p@colegio.edu' } }),
      prisma.category.findFirstOrThrow(),
      prisma.documentType.findFirstOrThrow(),
      prisma.documentTemplate.findFirstOrThrow(),
    ]);
    adminId = admin.id;
    coordinatorId = coordinator.id;
    userId = user.id;
    categoryId = category.id;
    documentTypeId = documentType.id;
    templateId = template.id;
    unauthorizedToken = await login('maestro.1p@colegio.edu');
    coordinatorToken = await login('coord.primaria@colegio.edu');
    adminToken = await login('admin@colegio.edu');
  });

  afterAll(async () => {
    for (const roleId of runtimeRoleIds) {
      await prisma.documentPermission.deleteMany({ where: { roleId } });
      await prisma.documentShare.deleteMany({ where: { roleId } });
      await prisma.userRoleAssignment.deleteMany({ where: { roleId } });
      await prisma.role.delete({ where: { id: roleId } });
    }
    await prisma.document.deleteMany({ where: { id: { in: runtimeDocumentIds } } });
    await prisma.category.deleteMany({ where: { id: { in: runtimeCategoryIds } } });
    await app.close();
  });

  it('rejects direct centralized mutations without changing data', async () => {
    const before = await Promise.all([
      prisma.user.count(),
      prisma.category.count(),
      prisma.documentType.count(),
      prisma.documentTemplate.count(),
      prisma.document.count(),
    ]);
    const auth = { Authorization: `Bearer ${unauthorizedToken}` };

    await request(app.getHttpServer()).post('/users').set(auth).send({
      email: `blocked-${randomUUID()}@example.com`, name: 'Blocked', password: 'Demo123!',
    }).expect(403);
    await request(app.getHttpServer()).patch(`/users/${adminId}`).set(auth).send({ name: 'Blocked' }).expect(403);
    await request(app.getHttpServer()).delete(`/users/${adminId}`).set(auth).expect(403);

    await request(app.getHttpServer()).post('/categories').set(auth).send({ name: `Blocked ${randomUUID()}` }).expect(403);
    await request(app.getHttpServer()).patch(`/categories/${categoryId}`).set(auth).send({ name: 'Blocked' }).expect(403);
    await request(app.getHttpServer()).delete(`/categories/${categoryId}`).set(auth).expect(403);

    await request(app.getHttpServer()).post('/document-types').set(auth).send({ name: `Blocked ${randomUUID()}`, categoryId }).expect(403);
    await request(app.getHttpServer()).patch(`/document-types/${documentTypeId}`).set(auth).send({ name: 'Blocked' }).expect(403);
    await request(app.getHttpServer()).delete(`/document-types/${documentTypeId}`).set(auth).expect(403);

    await request(app.getHttpServer()).post('/document-templates').set(auth).send({
      name: `Blocked ${randomUUID()}`, fields: { fields: [] }, htmlTemplate: '<p>blocked</p>',
    }).expect(403);
    await request(app.getHttpServer()).patch(`/document-templates/${templateId}`).set(auth).send({ name: 'Blocked' }).expect(403);
    await request(app.getHttpServer()).delete(`/document-templates/${templateId}`).set(auth).expect(403);
    await request(app.getHttpServer()).post(`/document-templates/${templateId}/duplicate`).set(auth).send({}).expect(403);
    await request(app.getHttpServer()).post('/documents/from-template').set(auth).send({ templateId, formData: {} }).expect(403);

    await expect(Promise.all([
      prisma.user.count(), prisma.category.count(), prisma.documentType.count(),
      prisma.documentTemplate.count(), prisma.document.count(),
    ])).resolves.toEqual(before);
  });

  it('allows a catalog-assigned permission user to grant a catalog document permission', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'categories.manage' } });
    const role = await prisma.role.create({ data: { key: `runtime-${randomUUID()}`, label: 'Runtime role' } });
    runtimeRoleIds.push(role.id);
    await prisma.userRoleAssignment.create({ data: { userId: coordinatorId, roleId: role.id } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const document = await prisma.document.create({ data: { description: 'Runtime grant', uploadedById: adminId } });
    runtimeDocumentIds.push(document.id);

    const response = await request(app.getHttpServer())
      .post(`/permissions/documents/${document.id}/grant`)
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ roleKey: role.key, userId, canView: true })
      .expect(201);

    expect(response.body.roleId).toBe(role.id);
    await expect(prisma.documentPermission.count({ where: { documentId: document.id, roleId: role.id } })).resolves.toBe(1);
  });

  it('creates and assigns a role through the role-management API before authorizing a mutation', async () => {
    const roleKey = `runtime-api-${randomUUID()}`;
    const created = await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: roleKey, label: 'Runtime API role', permissionKeys: ['categories.manage'] })
      .expect(201);
    runtimeRoleIds.push(created.body.id);

    await request(app.getHttpServer())
      .post(`/roles/${created.body.id}/assign/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const assignedToken = await login('maestro.1p@colegio.edu');
    const category = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${assignedToken}`)
      .send({ name: `Runtime API ${randomUUID()}` })
      .expect(201);
    runtimeCategoryIds.push(category.body.id);
    expect(category.body.name).toContain('Runtime API');
  });

  it('authorizes a protected resource with a claimless legacy JWT', async () => {
    const legacyToken = jwt.sign(
      { sub: adminId, email: 'admin@colegio.edu', role: 'admin' },
      process.env.JWT_SECRET || 'test-secret-key-for-testing-only',
    );

    const response = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', `Bearer ${legacyToken}`)
      .expect(200);

    expect(response.body).toEqual(expect.any(Array));
  });

  it('allows an authorized administrator to update a template through HTTP', async () => {
    const originalName = (await prisma.documentTemplate.findUniqueOrThrow({ where: { id: templateId } })).name;
    const updatedName = `${originalName} runtime`;

    const response = await request(app.getHttpServer())
      .patch(`/document-templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: updatedName })
      .expect(200);

    expect(response.body.name).toBe(updatedName);
    await prisma.documentTemplate.update({ where: { id: templateId }, data: { name: originalName } });
  });

  it('allows one administrator to lose a role while another remains', async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'roles.manage' } });
    const recoveryRole = await prisma.role.create({
      data: { key: `runtime-recovery-${randomUUID()}`, label: 'Runtime recovery authority' },
    });
    const secondAdmin = await prisma.user.create({
      data: {
        email: `runtime-admin-${randomUUID()}@example.com`,
        name: 'Runtime administrator',
        password: 'not-used',
        role: 'admin',
      },
    });

    try {
      await prisma.role.update({ where: { id: adminRole.id }, data: { isActive: true } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: recoveryRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: recoveryRole.id, permissionId: permission.id },
      });
      await prisma.userRoleAssignment.create({ data: { userId: secondAdmin.id, roleId: recoveryRole.id } });
      const response = await request(app.getHttpServer())
        .patch(`/roles/${adminRole.id}`)
        .set('Authorization', `Bearer ${await login('admin@colegio.edu')}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isActive).toBe(false);
    } finally {
      await prisma.role.update({ where: { id: adminRole.id }, data: { isActive: true } });
      await prisma.userRoleAssignment.deleteMany({ where: { userId: secondAdmin.id, roleId: recoveryRole.id } });
      await prisma.rolePermission.deleteMany({ where: { roleId: recoveryRole.id } });
      await prisma.role.delete({ where: { id: recoveryRole.id } });
      await prisma.user.delete({ where: { id: secondAdmin.id } });
    }
  });

  it('denies a stale token after its assigned role and permission are revoked', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'templates.manage' } });
    const role = await prisma.role.create({ data: { key: `stale-${randomUUID()}`, label: 'Stale token role' } });
    runtimeRoleIds.push(role.id);
    const originalName = (await prisma.documentTemplate.findUniqueOrThrow({ where: { id: templateId } })).name;
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id } });
    const token = await login('maestro.1p@colegio.edu');

    await request(app.getHttpServer())
      .patch(`/document-templates/${templateId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Authorized before revocation' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/roles/${role.id}`)
      .set('Authorization', `Bearer ${await login('admin@colegio.edu')}`)
      .send({ permissionKeys: [] })
      .expect(200);

    try {
      await request(app.getHttpServer())
        .patch(`/document-templates/${templateId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Must remain unchanged' })
        .expect(401);
    } finally {
      await prisma.documentTemplate.update({ where: { id: templateId }, data: { name: originalName } });
    }
  });

  it('rejects protected operations when the catalog role is inactive', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'templates.manage' } });
    const role = await prisma.role.create({ data: { key: `inactive-${randomUUID()}`, label: 'Inactive role' } });
    runtimeRoleIds.push(role.id);
    const originalName = (await prisma.documentTemplate.findUniqueOrThrow({ where: { id: templateId } })).name;
    const authorizedName = `Authorized while role active ${randomUUID()}`;

    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id } });
    const assignedToken = await login('maestro.1p@colegio.edu');
    await request(app.getHttpServer())
      .patch(`/document-templates/${templateId}`)
      .set('Authorization', `Bearer ${assignedToken}`)
      .send({ name: authorizedName })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/roles/${role.id}/deactivate`)
      .set('Authorization', `Bearer ${await login('admin@colegio.edu')}`)
      .expect(201);

    const freshToken = await login('maestro.1p@colegio.edu');
    await request(app.getHttpServer())
      .patch(`/document-templates/${templateId}`)
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ name: `Must remain unchanged after inactive role ${randomUUID()}` })
      .expect(403);

    await prisma.documentTemplate.update({ where: { id: templateId }, data: { name: originalName } });
  });

  it('returns matching current authorization from login and profile', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@colegio.edu', password: 'Demo123!' })
      .expect(200);
    const profileResponse = await request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${loginResponse.body.access_token}`)
      .expect(200);

    expect({
      user: loginResponse.body.user,
      roles: loginResponse.body.roles,
      permissions: loginResponse.body.permissions,
      authRevision: loginResponse.body.authRevision,
    }).toEqual(profileResponse.body);
  });

  it('resolves legacy and catalog role document records through HTTP', async () => {
    const role = await prisma.role.create({ data: { key: `access-${randomUUID()}`, label: 'Access role' } });
    runtimeRoleIds.push(role.id);
    await prisma.userRoleAssignment.create({ data: { userId, roleId: role.id } });
    const [legacyDocument, catalogDocument, legacyShareDocument, catalogShareDocument] = await Promise.all([
      prisma.document.create({ data: { description: 'Legacy access', uploadedById: adminId } }),
      prisma.document.create({ data: { description: 'Catalog access', uploadedById: adminId } }),
      prisma.document.create({ data: { description: 'Legacy share access', uploadedById: adminId } }),
      prisma.document.create({ data: { description: 'Catalog share access', uploadedById: adminId } }),
    ]);
    runtimeDocumentIds.push(
      legacyDocument.id, catalogDocument.id, legacyShareDocument.id, catalogShareDocument.id,
    );
    await prisma.documentPermission.create({
      data: { documentId: legacyDocument.id, role: 'profesor', grantedById: adminId, canView: true },
    });
    await prisma.documentPermission.create({
      data: { documentId: catalogDocument.id, roleId: role.id, grantedById: adminId, canView: true },
    });
    await prisma.documentShare.create({
      data: {
        documentId: legacyShareDocument.id, role: 'profesor', sharedById: adminId,
        shareToken: randomUUID(), canView: true,
      },
    });
    await prisma.documentShare.create({
      data: {
        documentId: catalogShareDocument.id, roleId: role.id, sharedById: adminId,
        shareToken: randomUUID(), canView: true,
      },
    });

    const explain = (id: number) => request(app.getHttpServer())
      .post('/permissions/explain')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({ documentId: id, userId })
      .expect(201);
    await expect(explain(legacyDocument.id)).resolves.toMatchObject({ body: { hasAccess: true } });
    await expect(explain(catalogDocument.id)).resolves.toMatchObject({ body: { hasAccess: true } });
    await expect(explain(legacyShareDocument.id)).resolves.toMatchObject({ body: { hasAccess: true } });
    await expect(explain(catalogShareDocument.id)).resolves.toMatchObject({ body: { hasAccess: true } });

    await prisma.userRoleAssignment.delete({ where: { userId_roleId: { userId, roleId: role.id } } });
    await expect(explain(legacyDocument.id)).resolves.toMatchObject({ body: { hasAccess: true } });
    await expect(explain(catalogDocument.id)).resolves.toMatchObject({ body: { hasAccess: false } });
    await expect(explain(legacyShareDocument.id)).resolves.toMatchObject({ body: { hasAccess: true } });
    await expect(explain(catalogShareDocument.id)).resolves.toMatchObject({ body: { hasAccess: false } });

    await prisma.document.deleteMany({
      where: { id: { in: [legacyDocument.id, catalogDocument.id, legacyShareDocument.id, catalogShareDocument.id] } },
    });
  });
});
