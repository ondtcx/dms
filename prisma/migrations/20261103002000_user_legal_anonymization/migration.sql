-- Anonimización legal: la fila de usuario permanece como tombstone histórico.
ALTER TABLE "User"
  ADD COLUMN "anonymizedAt" TIMESTAMP(3),
  ADD COLUMN "anonymizedById" TEXT;

CREATE INDEX "User_anonymizedById_idx" ON "User"("anonymizedById");

ALTER TABLE "User"
  ADD CONSTRAINT "User_anonymizedById_fkey"
  FOREIGN KEY ("anonymizedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ANONYMIZE';
