ALTER TABLE "Directory"
  ADD COLUMN "receptionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "singleDocumentPerParticipant" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DirectoryUserParticipant" (
  "directoryId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "peerRead" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DirectoryUserParticipant_pkey" PRIMARY KEY ("directoryId", "userId"),
  CONSTRAINT "DirectoryUserParticipant_directoryId_fkey" FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectoryUserParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DirectoryUserParticipant_userId_idx" ON "DirectoryUserParticipant"("userId");

CREATE TABLE "DirectoryRoleParticipant" (
  "directoryId" INTEGER NOT NULL,
  "roleId" INTEGER NOT NULL,
  "peerRead" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DirectoryRoleParticipant_pkey" PRIMARY KEY ("directoryId", "roleId"),
  CONSTRAINT "DirectoryRoleParticipant_directoryId_fkey" FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectoryRoleParticipant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DirectoryRoleParticipant_roleId_idx" ON "DirectoryRoleParticipant"("roleId");

CREATE TABLE "DirectoryDelegate" (
  "directoryId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "full" BOOLEAN NOT NULL DEFAULT false,
  "configure" BOOLEAN NOT NULL DEFAULT false,
  "manageParticipants" BOOLEAN NOT NULL DEFAULT false,
  "readAll" BOOLEAN NOT NULL DEFAULT false,
  "review" BOOLEAN NOT NULL DEFAULT false,
  "manageDelegates" BOOLEAN NOT NULL DEFAULT false,
  "manageStructure" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DirectoryDelegate_pkey" PRIMARY KEY ("directoryId", "userId"),
  CONSTRAINT "DirectoryDelegate_directoryId_fkey" FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectoryDelegate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DirectoryDelegate_userId_idx" ON "DirectoryDelegate"("userId");
