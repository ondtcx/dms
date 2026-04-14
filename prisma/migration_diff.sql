-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_batchId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_templateId_fkey";

-- DropIndex
DROP INDEX "Document_academicYearId_idx";

-- DropIndex
DROP INDEX "Document_batchId_idx";

-- DropIndex
DROP INDEX "Document_courseId_idx";

-- DropIndex
DROP INDEX "Document_searchVector_idx";

-- DropIndex
DROP INDEX "Document_storedName_key";

-- DropIndex
DROP INDEX "Document_subjectId_idx";

-- DropIndex
DROP INDEX "Document_templateId_idx";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "academicYearId",
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

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "filename" TEXT NOT NULL,
ADD COLUMN     "mimetype" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "DocumentAcademic" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "courseId" INTEGER,
    "subjectId" INTEGER,
    "academicYearId" INTEGER,

    CONSTRAINT "DocumentAcademic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSearch" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "searchVector" tsvector,
    "extractedText" TEXT,

    CONSTRAINT "DocumentSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplateData" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "templateId" INTEGER,
    "formData" JSONB,
    "batchId" TEXT,

    CONSTRAINT "DocumentTemplateData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAcademic_documentId_key" ON "DocumentAcademic"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAcademic_documentId_idx" ON "DocumentAcademic"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAcademic_courseId_idx" ON "DocumentAcademic"("courseId");

-- CreateIndex
CREATE INDEX "DocumentAcademic_subjectId_idx" ON "DocumentAcademic"("subjectId");

-- CreateIndex
CREATE INDEX "DocumentAcademic_academicYearId_idx" ON "DocumentAcademic"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSearch_documentId_key" ON "DocumentSearch"("documentId");

-- CreateIndex
CREATE INDEX "DocumentSearch_documentId_idx" ON "DocumentSearch"("documentId");

-- CreateIndex
CREATE INDEX "DocumentSearch_searchVector_idx" ON "DocumentSearch" USING GIN ("searchVector");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateData_documentId_key" ON "DocumentTemplateData"("documentId");

-- CreateIndex
CREATE INDEX "DocumentTemplateData_documentId_idx" ON "DocumentTemplateData"("documentId");

-- CreateIndex
CREATE INDEX "DocumentTemplateData_templateId_idx" ON "DocumentTemplateData"("templateId");

-- CreateIndex
CREATE INDEX "DocumentTemplateData_batchId_idx" ON "DocumentTemplateData"("batchId");

-- AddForeignKey
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAcademic" ADD CONSTRAINT "DocumentAcademic_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSearch" ADD CONSTRAINT "DocumentSearch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DocumentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

