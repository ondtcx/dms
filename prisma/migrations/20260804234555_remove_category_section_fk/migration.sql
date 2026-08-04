-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_sectionId_fkey";

-- DropIndex
DROP INDEX "Category_sectionId_idx";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "sectionId";
