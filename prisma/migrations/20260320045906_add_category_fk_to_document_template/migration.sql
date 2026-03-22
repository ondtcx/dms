/*
  Warnings:

  - You are about to drop the column `category` on the `DocumentTemplate` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "DocumentTemplate_category_idx";

-- AlterTable
ALTER TABLE "DocumentTemplate" DROP COLUMN "category",
ADD COLUMN     "categoryId" INTEGER;

-- CreateIndex
CREATE INDEX "DocumentTemplate_categoryId_idx" ON "DocumentTemplate"("categoryId");

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
