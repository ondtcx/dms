ALTER TABLE "Notification"
ADD COLUMN "actorId" TEXT,
ADD COLUMN "actorName" TEXT,
ADD COLUMN "actorRole" TEXT;

CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
