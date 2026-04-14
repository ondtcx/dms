-- 1. Create new tables
CREATE TABLE "DocumentAcademic" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "subjectId" INTEGER,
    "academicYearId" INTEGER,
    CONSTRAINT "DocumentAcademic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentSearch" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "searchVector" tsvector,
    "extractedText" TEXT,
    CONSTRAINT "DocumentSearch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentTemplateData" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "templateId" INTEGER,
    "formData" JSONB,
    "batchId" TEXT,
    CONSTRAINT "DocumentTemplateData_pkey" PRIMARY KEY ("id")
);

-- 2. Alter DocumentVersion to add columns as NULLable initially
ALTER TABLE "DocumentVersion" ADD COLUMN "filename" TEXT;
ALTER TABLE "DocumentVersion" ADD COLUMN "mimetype" TEXT;

-- 3. Data Migration!
-- Populate DocumentAcademic
INSERT INTO "DocumentAcademic" ("documentId", "courseId", "subjectId", "academicYearId")
SELECT "id", "courseId", "subjectId", "academicYearId"
FROM "Document"
WHERE "courseId" IS NOT NULL OR "subjectId" IS NOT NULL OR "academicYearId" IS NOT NULL;

-- Populate DocumentSearch
INSERT INTO "DocumentSearch" ("documentId", "searchVector", "extractedText")
SELECT "id", "searchVector", "extractedText"
FROM "Document"
WHERE "searchVector" IS NOT NULL OR "extractedText" IS NOT NULL;

-- Populate DocumentTemplateData
INSERT INTO "DocumentTemplateData" ("documentId", "templateId", "formData", "batchId")
SELECT "id", "templateId", "formData", "batchId"
FROM "Document"
WHERE "templateId" IS NOT NULL OR "formData" IS NOT NULL OR "batchId" IS NOT NULL;

-- Migrate filename and mimetype to DocumentVersion
UPDATE "DocumentVersion" dv
SET "filename" = d."filename",
    "mimetype" = d."mimetype"
FROM "Document" d
WHERE dv."documentId" = d."id";

-- Fallbacks for any orphaned versions
UPDATE "DocumentVersion" SET "filename" = 'unknown' WHERE "filename" IS NULL;
UPDATE "DocumentVersion" SET "mimetype" = 'application/octet-stream' WHERE "mimetype" IS NULL;

-- Set DocumentVersion columns to NOT NULL
ALTER TABLE "DocumentVersion" ALTER COLUMN "filename" SET NOT NULL;
ALTER TABLE "DocumentVersion" ALTER COLUMN "mimetype" SET NOT NULL;

-- 4. Create Indexes
CREATE UNIQUE INDEX "DocumentAcademic_documentId_key" ON "DocumentAcademic"("documentId");
CREATE INDEX "DocumentAcademic_documentId_idx" ON "DocumentAcademic"("documentId");
CREATE INDEX "DocumentAcademic_courseId_idx" ON "DocumentAcademic"("courseId");
CREATE INDEX "DocumentAcademic_subjectId_idx" ON "DocumentAcademic"("subjectId");
CREATE INDEX "DocumentAcademic_academicYearId_idx" ON "DocumentAcademic"("academicYearId");

CREATE UNIQUE INDEX "DocumentSearch_documentId_key" ON "DocumentSearch"("documentId");
CREATE INDEX "DocumentSearch_documentId_idx" ON "DocumentSearch"("documentId");
CREATE INDEX "DocumentSearch_searchVector_idx" ON "DocumentSearch" USING GIN ("searchVector");

CREATE UNIQUE INDEX "DocumentTemplateData_documentId_key" ON "DocumentTemplateData"("documentId");
CREATE INDEX "DocumentTemplateData_documentId_idx" ON "DocumentTemplateData"("documentId");
CREATE INDEX "DocumentTemplateData_templateId_idx" ON "DocumentTemplateData"("templateId");
CREATE INDEX "DocumentTemplateData_batchId_idx" ON "DocumentTemplateData"("batchId");

-- 5. Drop old foreign keys and indexes from Document
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_academicYearId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_batchId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_courseId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_subjectId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_templateId_fkey";

DROP INDEX IF EXISTS "Document_academicYearId_idx";
DROP INDEX IF EXISTS "Document_batchId_idx";
DROP INDEX IF EXISTS "Document_courseId_idx";
DROP INDEX IF EXISTS "Document_searchVector_idx";
DROP INDEX IF EXISTS "Document_storedName_key";
DROP INDEX IF EXISTS "Document_subjectId_idx";
DROP INDEX IF EXISTS "Document_templateId_idx";

-- 6. Drop Columns from Document
DROP TRIGGER IF EXISTS "document_search_vector_trigger" ON "Document" CASCADE;
DROP FUNCTION IF EXISTS "document_search_vector_update" CASCADE;

ALTER TABLE "Document" 
DROP COLUMN "academicYearId",
DROP COLUMN "batchId",
DROP COLUMN "courseId",
DROP COLUMN "extractedText",
DROP COLUMN "filename",
DROP COLUMN "formData",
DROP COLUMN "mimetype",
DROP COLUMN "path",
DROP COLUMN "searchVector",
DROP COLUMN "size",
DROP COLUMN "storedName",
DROP COLUMN "subjectId",
DROP COLUMN "templateId";

-- 7. Add new foreign keys
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DocumentSearch" ADD CONSTRAINT "DocumentSearch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DocumentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
