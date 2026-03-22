-- DropIndex
DROP INDEX "WorkflowTemplate_documentType_idx";

-- DropIndex
DROP INDEX "Section_context_idx";

-- AlterTable: remove documentType from WorkflowTemplate
ALTER TABLE "WorkflowTemplate" DROP COLUMN "documentType";

-- AlterTable: remove context from Section
ALTER TABLE "Section" DROP COLUMN "context";

-- DropEnum
DROP TYPE "CategoryContext";

-- CreateTable: implicit M2M join table (Prisma naming: _SectionToWorkflowTemplate, alphabetical)
CREATE TABLE "_SectionToWorkflowTemplate" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_SectionToWorkflowTemplate_A_fkey" FOREIGN KEY ("A") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_SectionToWorkflowTemplate_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_SectionToWorkflowTemplate_AB_unique" ON "_SectionToWorkflowTemplate"("A", "B");
CREATE INDEX "_SectionToWorkflowTemplate_B_index" ON "_SectionToWorkflowTemplate"("B");
