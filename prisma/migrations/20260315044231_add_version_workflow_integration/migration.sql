-- CreateEnum
CREATE TYPE "DocumentVersionSource" AS ENUM ('UPLOAD_INICIAL', 'REEMPLAZO_MANUAL', 'RESTAURACION', 'CAMBIOS_SOLICITADOS');

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "source" "DocumentVersionSource" NOT NULL DEFAULT 'REEMPLAZO_MANUAL',
ADD COLUMN     "workflowId" INTEGER;

-- AlterTable
ALTER TABLE "WorkflowApproval" ADD COLUMN     "documentVersionId" INTEGER;

-- CreateIndex
CREATE INDEX "DocumentVersion_source_idx" ON "DocumentVersion"("source");

-- CreateIndex
CREATE INDEX "DocumentVersion_workflowId_idx" ON "DocumentVersion"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_documentVersionId_idx" ON "WorkflowApproval"("documentVersionId");

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "DocumentWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migración de datos históricos: corregir source en registros existentes
UPDATE "DocumentVersion" SET "source" = 'UPLOAD_INICIAL'
  WHERE version = 1;

UPDATE "DocumentVersion" SET "source" = 'RESTAURACION'
  WHERE version > 1 AND comment LIKE 'Restaurada desde versión%';

-- El resto (version > 1, no restauración) queda como REEMPLAZO_MANUAL (ya es el default)
