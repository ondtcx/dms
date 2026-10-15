import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AuthModule } from '../src/auth/auth.module';
import { UserModule } from '../src/user/user.module';
import { RoleModule } from '../src/role/role.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true,
    load: [() => ({ catalogAuthorizationEnabled: true })] }), AuthModule, UserModule, RoleModule],
})
class CatalogRoleE2eModule {}

async function main() {
  const root = process.env.CATALOG_E2E_ROOT!;
  const runId = process.env.CATALOG_E2E_RUN_ID!;
  const url = new URL(process.env.DATABASE_URL!);
  const pidFile = join(root, 'pgdata/postmaster.pid');
  if (!root.endsWith('catalog-role-' + runId) || process.cwd() !== root ||
      url.hostname !== '127.0.0.1' || url.port !== '55433' || url.pathname !== '/catalog_e2e' ||
      !existsSync(pidFile)) throw new Error('Disposable database boundary rejected');
  process.kill(Number(readFileSync(pidFile, 'utf8').split('\n')[0]), 0);
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const roleIds: number[] = [];
  const permissionIds: number[] = [];
  let settingsId: number | undefined;
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let stopping = false;
  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await app?.close();
      await prisma.user.deleteMany({ where: { email: { in: [
        process.env.CATALOG_E2E_ADMIN_EMAIL!, 'created-' + runId + '@example.test',
        'rejected-' + runId + '@example.test',
      ] } } });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await prisma.permission.deleteMany({ where: { id: { in: permissionIds } } });
      if (settingsId !== undefined) await prisma.systemSettings.delete({ where: { id: settingsId } });
      console.log('Owned fixtures removed');
    } finally { await prisma.$disconnect(); }
  };
  try {
    const password = await bcrypt.hash(process.env.CATALOG_E2E_PASSWORD!, 10);
    await prisma.$transaction(async tx => {
      const permissions = [];
      for (const key of ['users.manage', 'roles.manage']) {
        let permission = await tx.permission.findUnique({ where: { key } });
        if (!permission) {
          permission = await tx.permission.create({ data: { key, label: key } });
          permissionIds.push(permission.id);
        }
        permissions.push(permission);
      }
      const authority = await tx.role.create({ data: { key: 'e2e_admin_' + runId,
        label: 'E2E administrator', permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } });
      roleIds.push(authority.id);
      for (const isActive of [true, false]) {
        const role = await tx.role.create({ data: { key: 'e2e_inspector_' + isActive + '_' + runId,
          label: isActive ? 'Inspector General' : 'Inactive Inspector General', isActive, legacyRole: null } });
        roleIds.push(role.id);
      }
      await tx.user.create({ data: { email: process.env.CATALOG_E2E_ADMIN_EMAIL!,
        name: 'E2E administrator', password, role: 'admin', roleAssignments: { create: { roleId: authority.id } } } });
      if (!await tx.systemSettings.findFirst()) {
        settingsId = (await tx.systemSettings.create({ data: {
          security: { sessionTimeoutMinutes: 60, maxLoginAttempts: 5 },
        } })).id;
      }
    });
    app = await NestFactory.create(CatalogRoleE2eModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ enableDebugMessages: true, whitelist: true, forbidNonWhitelisted: true }));
    app.enableCors({ origin: 'http://127.0.0.1:3100', credentials: true });
    await app.listen(3101, '127.0.0.1');
    console.log('Scoped production Auth/User/Role API ready on loopback 3101');
    process.stdin.on('data', () => cleanup().then(() => process.exit(0)).catch(() => process.exit(1)));
  } catch {
    await cleanup();
    throw new Error('Scoped API startup failed; no credentials logged');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
