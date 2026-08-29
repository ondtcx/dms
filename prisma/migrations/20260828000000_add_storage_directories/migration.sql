CREATE TABLE "Directory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "parentId" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Directory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Document" ADD COLUMN "directoryId" INTEGER;

CREATE INDEX "Directory_parentId_idx" ON "Directory"("parentId");
CREATE INDEX "Directory_nameNormalized_idx" ON "Directory"("nameNormalized");
CREATE INDEX "Directory_createdById_idx" ON "Directory"("createdById");
CREATE INDEX "Document_directoryId_idx" ON "Document"("directoryId");
CREATE UNIQUE INDEX "Directory_root_nameNormalized_key"
  ON "Directory"("nameNormalized") WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "Directory_sibling_nameNormalized_key"
  ON "Directory"("parentId", "nameNormalized") WHERE "parentId" IS NOT NULL;

ALTER TABLE "Directory" ADD CONSTRAINT "Directory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Directory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Directory" ADD CONSTRAINT "Directory_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_directoryId_fkey"
  FOREIGN KEY ("directoryId") REFERENCES "Directory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
