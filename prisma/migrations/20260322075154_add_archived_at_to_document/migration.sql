-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "_SectionToWorkflowTemplate" ADD CONSTRAINT "_SectionToWorkflowTemplate_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_SectionToWorkflowTemplate_AB_unique";

-- CreateIndex
CREATE INDEX "Document_archivedAt_idx" ON "Document"("archivedAt");
