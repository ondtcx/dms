import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('legacy role migration reporting fixture', () => {
  it('reports unmapped values and keeps catalog authorization disabled', () => {
    const migration = readFileSync(resolve(__dirname, '../../prisma/migrations/20260826000000_add_role_permission_catalog/migration.sql'), 'utf8');

    expect(migration).toContain("RAISE WARNING 'Unmapped legacy roles found");
    expect(migration).toContain('catalog authorization must remain disabled');
    expect(migration).toContain('LEFT JOIN "Role" r ON r."legacyRole" = u."role"');
  });
});
