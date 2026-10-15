ALTER TABLE "DocumentType"
ALTER COLUMN "categoryId" DROP NOT NULL;

CREATE UNIQUE INDEX "DocumentType_uncategorized_name_key"
ON "DocumentType" ("name")
WHERE "categoryId" IS NULL;

UPDATE "DocumentType"
SET "isDefault" = false
WHERE "isDefault" = true;

INSERT INTO "DocumentType" (
  "name",
  "description",
  "categoryId",
  "isActive",
  "isDefault",
  "createdAt",
  "updatedAt"
)
VALUES (
  'Documento general',
  'Tipo predeterminado para documentos sin una clasificación específica',
  NULL,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
