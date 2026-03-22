-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "DocumentBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentBatch_createdById_idx" ON "DocumentBatch"("createdById");

-- CreateIndex
CREATE INDEX "DocumentBatch_templateId_idx" ON "DocumentBatch"("templateId");

-- CreateIndex
CREATE INDEX "DocumentBatch_createdAt_idx" ON "DocumentBatch"("createdAt");

-- CreateIndex
CREATE INDEX "Document_batchId_idx" ON "Document"("batchId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "DocumentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBatch" ADD CONSTRAINT "DocumentBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBatch" ADD CONSTRAINT "DocumentBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
