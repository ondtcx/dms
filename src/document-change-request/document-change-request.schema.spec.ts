import { readFileSync } from 'fs';
import { join } from 'path';

describe('change request migration contract', () => {
  it('structurally includes submitted proposals in the partial unique active-document index', () => {
    const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261016000000_document_change_requests/migration.sql'), 'utf8');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "DocumentChangeRequest_one_active_document"[\s\S]*?ON "DocumentChangeRequest"\("documentId"\)[\s\S]*?WHERE "status" IN \('PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED'\)/);
    expect(sql).toContain('"DocumentChangeRequest_submission_check"');
  });
});
