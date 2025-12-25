-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "category" TEXT;

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");
