-- CreateEnum
CREATE TYPE "CategoryContext" AS ENUM ('ACADEMIC', 'ADMINISTRATIVE', 'INSTITUTIONAL');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "allowedRoles" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "context" "CategoryContext" NOT NULL DEFAULT 'ADMINISTRATIVE',
ADD COLUMN     "requiresCourse" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Category_context_idx" ON "Category"("context");
