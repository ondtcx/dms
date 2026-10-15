-- CreateTable
CREATE TABLE "OnlyofficeCallbackReceipt" (
    "id" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlyofficeCallbackReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlyofficeCallbackReceipt_idempotencyKey_key" ON "OnlyofficeCallbackReceipt"("idempotencyKey");
CREATE INDEX "OnlyofficeCallbackReceipt_documentId_idx" ON "OnlyofficeCallbackReceipt"("documentId");

-- AddForeignKey
ALTER TABLE "OnlyofficeCallbackReceipt" ADD CONSTRAINT "OnlyofficeCallbackReceipt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
