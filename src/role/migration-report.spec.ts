import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('legacy role migration reporting fixture', () => {
  const migrationPath = resolve(
    __dirname,
    '../../prisma/migrations/20260827000000_backfill_role_catalog/migration.sql',
  );

  it('reports unmapped values and keeps catalog authorization disabled', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain("RAISE WARNING 'Unmapped legacy roles found");
    expect(migration).toContain('catalog authorization must remain disabled');
    expect(migration).toContain('LEFT JOIN "Role" r ON r."legacyRole" = u."role"');
  });

  it('backfills all legacy grant surfaces idempotently without changing legacy columns', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('INSERT INTO "UserRoleAssignment"');
    expect(migration).toContain('ON CONFLICT ("userId", "roleId") DO NOTHING');
    expect(migration).toContain('UPDATE "DocumentPermission"');
    expect(migration).toContain('UPDATE "DocumentShare"');
    expect(migration).toContain('WHERE dp."roleId" IS NULL');
    expect(migration).toContain('WHERE ds."roleId" IS NULL');
    expect(migration).toContain('Legacy document permissions and shares remain unchanged');
  });

  it('reports distinct unmapped user and grant values in one validation warning', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('DocumentPermission');
    expect(migration).toContain('DocumentShare');
    expect(migration).toContain('DISTINCT');
    expect(migration).toContain('unmapped user/document/share role values');
  });
});
