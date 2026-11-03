CREATE TYPE "DocumentReviewStatus" AS ENUM ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','ARCHIVED');
CREATE TYPE "DocumentReviewAction" AS ENUM ('CREATED','SUBMITTED','APPROVED','RETURNED','ARCHIVED');

CREATE TABLE "DocumentReview" (
  "id" SERIAL NOT NULL,
  "documentId" INTEGER NOT NULL,
  "status" "DocumentReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "documentVersionId" INTEGER,
  "submittedAt" TIMESTAMP(3),
  "reviewerId" TEXT,
  "reviewerName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "observation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentReview_documentId_key" ON "DocumentReview"("documentId");
CREATE INDEX "DocumentReview_status_idx" ON "DocumentReview"("status");

CREATE TABLE "DocumentReviewEvent" (
  "id" SERIAL NOT NULL,
  "reviewId" INTEGER NOT NULL,
  "action" "DocumentReviewAction" NOT NULL,
  "fromStatus" "DocumentReviewStatus",
  "toStatus" "DocumentReviewStatus" NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT,
  "observation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentReviewEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentReviewEvent_reviewId_createdAt_idx" ON "DocumentReviewEvent"("reviewId", "createdAt");

ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentReviewEvent" ADD CONSTRAINT "DocumentReviewEvent_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "DocumentReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DocumentReview" ("documentId","status","createdAt","updatedAt")
SELECT d."id", 'APPROVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Document" d
LEFT JOIN "DocumentAuthoring" a ON a."documentId" = d."id"
WHERE a."id" IS NULL
ON CONFLICT ("documentId") DO NOTHING;
