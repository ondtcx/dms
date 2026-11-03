-- Identificador común para agrupar una transferencia masiva de documentos.
ALTER TABLE "TransferHistory" ADD COLUMN "batchId" TEXT;

CREATE INDEX "TransferHistory_batchId_idx" ON "TransferHistory"("batchId");
