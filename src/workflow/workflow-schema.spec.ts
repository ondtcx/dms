import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('configurable workflow foundation', () => {
  const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const migration = readFileSync(
    resolve(__dirname, '../../prisma/migrations/20260905000000_configurable_document_workflows/migration.sql'),
    'utf8',
  );

  it('models immutable definition snapshots and historical executions', () => {
    expect(schema).toContain('model WorkflowTemplateVersion');
    expect(schema).toContain('model WorkflowStageDefinition');
    expect(schema).toContain('snapshot            Json');
    expect(schema).toContain('legacyReadOnly      Boolean');
    expect(migration).toContain('WorkflowTemplateVersion_templateId_version_key');
    expect(migration).toContain('WorkflowTemplateVersion_templateId_fkey');
  });

  it('enforces one active execution per document at the database boundary', () => {
    expect(schema).toContain('@@index([documentId, active])');
    expect(migration).toContain('WHERE "active" = true');
    expect(migration).toContain('DocumentWorkflow_one_active_per_document_key');
  });

  it('preserves legacy records as read-only compatibility data', () => {
    expect(migration).toContain('"legacyReadOnly" = true');
    expect(migration).toContain('"active" = w."status" NOT IN');
    expect(migration).toContain('jsonb_array_elements');
  });
});
