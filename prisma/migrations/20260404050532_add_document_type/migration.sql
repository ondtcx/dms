/*
  Warnings:

  - You are about to drop the column `type` on the `DocumentTemplate` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "DocumentTemplate_type_idx";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "documentTypeId" INTEGER;

-- AlterTable
ALTER TABLE "DocumentTemplate" DROP COLUMN "type",
ADD COLUMN     "documentTypeId" INTEGER;

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentType_categoryId_idx" ON "DocumentType"("categoryId");

-- CreateIndex
CREATE INDEX "DocumentType_isActive_idx" ON "DocumentType"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_name_categoryId_key" ON "DocumentType"("name", "categoryId");

-- CreateIndex
CREATE INDEX "Document_documentTypeId_idx" ON "Document"("documentTypeId");

-- CreateIndex
CREATE INDEX "DocumentTemplate_documentTypeId_idx" ON "DocumentTemplate"("documentTypeId");

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
