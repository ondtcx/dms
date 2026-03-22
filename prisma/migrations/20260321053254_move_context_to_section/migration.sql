-- CreateEnum
CREATE TYPE "CategoryContext" AS ENUM ('ACADEMIC', 'ADMINISTRATIVE', 'INSTITUTIONAL');

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "context" "CategoryContext" NOT NULL DEFAULT 'ADMINISTRATIVE';

-- CreateIndex
CREATE INDEX "Section_context_idx" ON "Section"("context");
