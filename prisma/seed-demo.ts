import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { validateDemoSeedEnvironment } from '../src/config/demo-seed';

export async function runDemoSeed(
  env: NodeJS.ProcessEnv,
  createClient: (databaseUrl: string) => PrismaClient,
): Promise<void> {
  const { databaseUrl, adminPassword } = validateDemoSeedEnvironment(env);
  const password = await bcrypt.hash(adminPassword, 10);
  const prisma = createClient(databaseUrl);
  try {
    await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: { email: 'admin@example.test', name: 'Administrador de demostración', password, role: 'admin' },
      });
      const adminRole = await tx.role.upsert({
        where: { key: 'admin' }, update: {},
        create: { key: 'admin', label: 'Administrador', legacyRole: 'admin', isSystem: true },
      });
      await tx.role.upsert({
        where: { key: 'user' }, update: {},
        create: { key: 'user', label: 'Usuario de demostración', legacyRole: 'user', isSystem: true },
      });
      await tx.userRoleAssignment.create({ data: { userId: admin.id, roleId: adminRole.id } });
      for (const [key, label] of [
        ['users.manage', 'Gestionar usuarios'],
        ['roles.manage', 'Gestionar roles y permisos'],
      ]) {
        const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key, label } });
        await tx.rolePermission.createMany({ data: [{ roleId: adminRole.id, permissionId: permission.id }], skipDuplicates: true });
      }
      const category = await tx.category.create({ data: { name: 'Demostración' } });
      await tx.documentType.create({
        data: { name: 'Documento de demostración', categoryId: category.id, isDefault: false },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}
