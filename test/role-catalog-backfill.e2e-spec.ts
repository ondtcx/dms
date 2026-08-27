import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

describe('role catalog backfill PostgreSQL harness', () => {
  const prisma = new PrismaClient();
  const migration = readFileSync(
    resolve(__dirname, '../prisma/migrations/20260827000000_backfill_role_catalog/migration.sql'),
    'utf8',
  );

  it('runs twice and proves mapped/unmapped user, document, and share behavior', async () => {
    await prisma.$transaction(async (tx) => {
      const [userRole, adminRole, owner] = await Promise.all([
        tx.role.findUniqueOrThrow({ where: { key: 'user' } }),
        tx.role.findUniqueOrThrow({ where: { key: 'admin' } }),
        tx.user.findFirstOrThrow({ where: { role: 'admin' } }),
      ]);
      const mappedUser = await tx.user.create({
        data: { email: `backfill-mapped-${randomUUID()}@example.com`, password: 'test', role: 'user' },
      });
      const unmappedUser = await tx.user.create({
        data: { email: `backfill-unmapped-${randomUUID()}@example.com`, password: 'test', role: 'admin' },
      });
      const mappedDocument = await tx.document.create({ data: { uploadedById: owner.id } });
      const unmappedDocument = await tx.document.create({ data: { uploadedById: owner.id } });

      await tx.documentPermission.create({
        data: { documentId: mappedDocument.id, role: 'user', grantedById: owner.id },
      });
      await tx.documentShare.create({
        data: { documentId: mappedDocument.id, role: 'user', sharedById: owner.id, shareToken: randomUUID() },
      });
      await tx.documentPermission.create({
        data: { documentId: unmappedDocument.id, role: 'admin', grantedById: owner.id },
      });
      await tx.documentShare.create({
        data: { documentId: unmappedDocument.id, role: 'admin', sharedById: owner.id, shareToken: randomUUID() },
      });

      await tx.role.update({ where: { id: adminRole.id }, data: { legacyRole: null } });
      await tx.$executeRawUnsafe(migration);
      await tx.$executeRawUnsafe(migration);

      await expect(tx.userRoleAssignment.count({ where: { userId: mappedUser.id, roleId: userRole.id } })).resolves.toBe(1);
      await expect(tx.userRoleAssignment.count({ where: { userId: unmappedUser.id } })).resolves.toBe(0);
      await expect(tx.documentPermission.findFirstOrThrow({ where: { documentId: mappedDocument.id } })).resolves.toMatchObject({
        role: 'user', roleId: userRole.id,
      });
      await expect(tx.documentShare.findFirstOrThrow({ where: { documentId: mappedDocument.id } })).resolves.toMatchObject({
        role: 'user', roleId: userRole.id,
      });
      await expect(tx.documentPermission.findFirstOrThrow({ where: { documentId: unmappedDocument.id } })).resolves.toMatchObject({
        role: 'admin', roleId: null,
      });
      await expect(tx.documentShare.findFirstOrThrow({ where: { documentId: unmappedDocument.id } })).resolves.toMatchObject({
        role: 'admin', roleId: null,
      });
    });
  });

  afterAll(async () => prisma.$disconnect());
});
