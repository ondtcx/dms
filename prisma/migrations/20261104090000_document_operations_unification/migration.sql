-- Blank institutional template support for editor-first document creation.
ALTER TABLE "DocumentTemplate"
ADD COLUMN "isBlank" BOOLEAN NOT NULL DEFAULT false;

-- Canonical academic years: 1 September to 30 June of the following year.
UPDATE "AcademicYear"
SET "isCurrent" = false
WHERE "isCurrent" = true;

UPDATE "AcademicYear"
SET "startDate" = TIMESTAMP '2024-09-01 00:00:00',
    "endDate" = TIMESTAMP '2025-06-30 00:00:00',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = '2024-2025';

UPDATE "AcademicYear"
SET "startDate" = TIMESTAMP '2025-09-01 00:00:00',
    "endDate" = TIMESTAMP '2026-06-30 00:00:00',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = '2025-2026';

INSERT INTO "AcademicYear"
  ("name", "startDate", "endDate", "isCurrent", "isActive", "createdAt", "updatedAt")
VALUES
  ('2026-2027', TIMESTAMP '2026-09-01 00:00:00', TIMESTAMP '2027-06-30 00:00:00', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "startDate" = EXCLUDED."startDate",
  "endDate" = EXCLUDED."endDate",
  "isCurrent" = true,
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Map the seeded institutional templates to their concrete document types.
WITH mapping(template_name, type_name) AS (
  VALUES
    ('Oficio institucional', 'Oficio'),
    ('Memorando institucional', 'Memorando'),
    ('Circular institucional', 'Circular'),
    ('Acta institucional', 'Acta de Consejo'),
    ('Constancia institucional', 'Constancia de Estudios'),
    ('Informe institucional', 'Informe de Rendimiento'),
    ('Acta de entrega-recepción', 'Acta de Entrega de Bienes')
)
UPDATE "DocumentTemplate" AS template
SET "documentTypeId" = type."id"
FROM mapping
JOIN "DocumentType" AS type ON type."name" = mapping.type_name
WHERE template."name" = mapping.template_name
  AND template."catalog" = 'institutional'
  AND template."documentTypeId" IS NULL;

-- Any other institutional template keeps a concrete type instead of null.
UPDATE "DocumentTemplate" AS template
SET "documentTypeId" = (
  SELECT "id"
  FROM "DocumentType"
  WHERE "isDefault" = true AND "isActive" = true
  ORDER BY "id"
  LIMIT 1
)
WHERE template."catalog" = 'institutional'
  AND template."documentTypeId" IS NULL;

-- Backfill authoring documents from their template type.
UPDATE "Document" AS document
SET "documentTypeId" = template."documentTypeId"
FROM "DocumentTemplateData" AS data
JOIN "DocumentTemplate" AS template ON template."id" = data."templateId"
WHERE data."documentId" = document."id"
  AND document."documentTypeId" IS NULL
  AND template."documentTypeId" IS NOT NULL;

-- Fallback for authoring documents whose template no longer exists.
UPDATE "Document" AS document
SET "documentTypeId" = (
  SELECT "id"
  FROM "DocumentType"
  WHERE "isDefault" = true AND "isActive" = true
  ORDER BY "id"
  LIMIT 1
)
FROM "DocumentAuthoring" AS authoring
WHERE authoring."documentId" = document."id"
  AND document."documentTypeId" IS NULL;
