import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('configurable workflow migration', () => {
  const migration = readFileSync(
    resolve(__dirname, '../../prisma/migrations/20260905000000_configurable_document_workflows/migration.sql'),
    'utf8',
  );

  it('backfills immutable legacy snapshots and read-only executions before enforcing active uniqueness', () => {
    expect(migration).toContain('INSERT INTO "WorkflowTemplateVersion"');
    expect(migration).toContain('INSERT INTO "WorkflowStageDefinition"');
    expect(migration).toContain('"legacyReadOnly" = true');
    expect(migration).toContain('CREATE UNIQUE INDEX "DocumentWorkflow_one_active_per_document_key"');
  });

  it('retains the legacy status projection and historical document version linkage', () => {
    expect(migration).toContain('"active" = w."status" NOT IN');
    expect(migration).toContain('SELECT dv."id"');
    expect(migration).toContain('WHERE dv."documentId" = w."documentId"');
  });
});
