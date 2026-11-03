-- Transferencia de propiedad: registra quién solicitó la transferencia
-- (propietario o administrador) sin alterar el autor histórico de versiones.
ALTER TABLE "TransferHistory" ADD COLUMN "initiatedById" TEXT;

CREATE INDEX "TransferHistory_initiatedById_idx" ON "TransferHistory"("initiatedById");
CREATE INDEX "TransferHistory_documentId_status_idx" ON "TransferHistory"("documentId", "status");

ALTER TABLE "TransferHistory"
  ADD CONSTRAINT "TransferHistory_initiatedById_fkey"
  FOREIGN KEY ("initiatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
