import { readFileSync } from 'fs';
import { join } from 'path';

const path = join(__dirname, '../../prisma/migrations/20261009000000_maintain_document_search_vectors/migration.sql');
describe('Document search migration structure (not runtime proof)', () => {
  const sql = () => readFileSync(path, 'utf8');
  it('weights Spanish inputs and selects the same latest version', () => {
    expect(sql()).toContain("setweight(to_tsvector('spanish', coalesce(parent.name, '') || ' ' || coalesce(filename, '')), 'A')");
    expect(sql()).toContain("setweight(to_tsvector('spanish', coalesce(parent.description, '')), 'B')");
    expect(sql()).toContain("setweight(to_tsvector('spanish', coalesce(content, '')), 'C')");
    expect(sql()).toContain('ORDER BY "createdAt" DESC, id DESC LIMIT 1');
  });
  it('locks search rows before fresh vector reads without parent write locks', () => {
    const source = sql();
    const vector = source.split('CREATE FUNCTION document_search_vector')[1].split('CREATE FUNCTION set_document_search_vector')[0];
    const refresh = source.split('CREATE FUNCTION refresh_document_search(target')[1].split('CREATE FUNCTION refresh_document_search_event')[0];
    expect(vector).toContain('LANGUAGE plpgsql VOLATILE');
    expect(vector).not.toMatch(/FOR (?:UPDATE|NO KEY UPDATE|KEY SHARE|SHARE)|\bSTABLE\b/i);
    expect(source).not.toMatch(/FROM "Document"[^;]*FOR (?:UPDATE|NO KEY UPDATE)/i);
    expect(refresh).toMatch(/PERFORM id FROM "DocumentSearch" WHERE "documentId" = target FOR NO KEY UPDATE;\s+IF NOT FOUND THEN/);
    expect(refresh).toMatch(/IF NOT FOUND THEN[\s\S]*FROM "Document" WHERE id = target FOR KEY SHARE;\s+IF NOT FOUND THEN RETURN; END IF;[\s\S]*INSERT INTO "DocumentSearch"[\s\S]*ON CONFLICT \("documentId"\) DO NOTHING;\s+PERFORM id FROM "DocumentSearch" WHERE "documentId" = target FOR NO KEY UPDATE;\s+END IF;\s+SELECT document_search_vector/);
    expect(source).not.toContain('ORDER BY id FOR NO KEY UPDATE');
  });
  it('guards absent-row insertion, preserves text and backfills without replacing GIN', () => {
    expect(sql()).toMatch(/FOR KEY SHARE;\s+IF NOT FOUND THEN RETURN; END IF;[\s\S]*INSERT INTO "DocumentSearch"/);
    expect(sql()).toContain('ON CONFLICT ("documentId") DO NOTHING');
    expect(sql()).toContain('IS DISTINCT FROM vector');
    expect(sql()).toContain('SELECT refresh_document_search(id) FROM "Document" ORDER BY id');
    expect(sql()).not.toMatch(/SET "extractedText"|CREATE INDEX|DROP |DELETE FROM/i);
  });
  it('computes NEW without recursive writes and defers parent/version events', () => {
    expect(sql()).toContain('NEW."searchVector" := document_search_vector');
    expect(sql()).toContain('BEFORE INSERT OR UPDATE ON "DocumentSearch"');
    expect(sql().match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(sql()).toContain('AFTER INSERT OR UPDATE OR DELETE ON "DocumentVersion"');
    expect(sql()).toContain('OLD."documentId" IS DISTINCT FROM NEW."documentId"');
    expect(sql()).toContain('refresh_document_search(OLD."documentId")');
    expect(sql()).toContain('refresh_document_search(NEW."documentId")');
  });
});
