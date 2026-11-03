-- Una sola solicitud pendiente por documento, incluso bajo concurrencia.
CREATE UNIQUE INDEX "TransferHistory_one_pending_document"
  ON "TransferHistory"("documentId")
  WHERE "status" = 'PENDING';
