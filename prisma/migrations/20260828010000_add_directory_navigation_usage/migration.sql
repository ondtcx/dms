CREATE TABLE "UserDirectoryUsage" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "directoryId" INTEGER NOT NULL,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UserDirectoryUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectoryNavigationEvent" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectoryNavigationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDirectoryUsage_userId_directoryId_key"
  ON "UserDirectoryUsage"("userId", "directoryId");
CREATE INDEX "UserDirectoryUsage_userId_lastAccessedAt_idx"
  ON "UserDirectoryUsage"("userId", "lastAccessedAt");
CREATE INDEX "UserDirectoryUsage_userId_accessCount_lastAccessedAt_idx"
  ON "UserDirectoryUsage"("userId", "accessCount", "lastAccessedAt");
CREATE INDEX "UserDirectoryUsage_directoryId_idx"
  ON "UserDirectoryUsage"("directoryId");
CREATE UNIQUE INDEX "DirectoryNavigationEvent_userId_eventId_key"
  ON "DirectoryNavigationEvent"("userId", "eventId");
CREATE INDEX "DirectoryNavigationEvent_directoryId_idx"
  ON "DirectoryNavigationEvent"("directoryId");
CREATE INDEX "DirectoryNavigationEvent_userId_directoryId_idx"
  ON "DirectoryNavigationEvent"("userId", "directoryId");

ALTER TABLE "UserDirectoryUsage" ADD CONSTRAINT "UserDirectoryUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDirectoryUsage" ADD CONSTRAINT "UserDirectoryUsage_directoryId_fkey"
  FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectoryNavigationEvent" ADD CONSTRAINT "DirectoryNavigationEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectoryNavigationEvent" ADD CONSTRAINT "DirectoryNavigationEvent_directoryId_fkey"
  FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
