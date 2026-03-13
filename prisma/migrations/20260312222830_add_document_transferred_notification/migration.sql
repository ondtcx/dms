-- CreateIndex
CREATE INDEX "TransferHistory_documentId_idx" ON "TransferHistory"("documentId");

-- CreateIndex
CREATE INDEX "TransferHistory_fromUserId_idx" ON "TransferHistory"("fromUserId");

-- CreateIndex
CREATE INDEX "TransferHistory_toUserId_idx" ON "TransferHistory"("toUserId");

-- CreateIndex
CREATE INDEX "TransferHistory_status_idx" ON "TransferHistory"("status");
