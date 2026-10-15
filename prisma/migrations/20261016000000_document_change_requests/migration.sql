CREATE TYPE "DocumentChangeRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED', 'ACCEPTED', 'CANCELLED');

CREATE TABLE "DocumentChangeRequest" (
  "id" SERIAL PRIMARY KEY,
  "documentId" INTEGER NOT NULL REFERENCES "Document"("id") ON DELETE CASCADE,
  "requestedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "status" "DocumentChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "message" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "baseVersionId" INTEGER NOT NULL,
  "stagedPath" TEXT,
  "filename" TEXT,
  "mimetype" TEXT,
  "size" INTEGER,
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentChangeRequest_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "DocumentChangeRequest_submission_check" CHECK (
    "status" <> 'CORRECTION_SUBMITTED' OR
    ("stagedPath" IS NOT NULL AND "filename" IS NOT NULL AND "mimetype" IS NOT NULL AND "size" > 0)
  )
);

CREATE UNIQUE INDEX "DocumentChangeRequest_one_active_document"
  ON "DocumentChangeRequest"("documentId")
  WHERE "status" IN ('PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED');
CREATE INDEX "DocumentChangeRequest_documentId_createdAt_idx" ON "DocumentChangeRequest"("documentId", "createdAt");
CREATE INDEX "DocumentChangeRequest_recipientId_status_idx" ON "DocumentChangeRequest"("recipientId", "status");
