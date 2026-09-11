-- Add the global default flag without changing existing document types.
ALTER TABLE "DocumentType"
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Keep existing installations usable by selecting one deterministic active type
-- when no configuration exists yet. The partial unique index below preserves
-- the invariant for all subsequent writes.
WITH "firstActiveDocumentType" AS (
  SELECT "id"
  FROM "DocumentType"
  WHERE "isActive" = true
  ORDER BY "id" ASC
  LIMIT 1
)
UPDATE "DocumentType"
SET "isDefault" = true
WHERE "id" IN (SELECT "id" FROM "firstActiveDocumentType");

CREATE INDEX "DocumentType_isDefault_idx" ON "DocumentType"("isDefault");

CREATE UNIQUE INDEX "DocumentType_single_default_idx"
ON "DocumentType" ("isDefault")
WHERE "isDefault" = true;
