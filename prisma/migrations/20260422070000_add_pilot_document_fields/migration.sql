CREATE TYPE "PilotDocumentStatus" AS ENUM ('REGISTRADO', 'EN_REVISION', 'ARCHIVADO');

ALTER TABLE "Document"
ADD COLUMN "title" TEXT,
ADD COLUMN "documentDate" TIMESTAMP(3),
ADD COLUMN "sender" TEXT,
ADD COLUMN "recipient" TEXT,
ADD COLUMN "keywords" TEXT,
ADD COLUMN "status" "PilotDocumentStatus" NOT NULL DEFAULT 'REGISTRADO',
ADD COLUMN "physicalBuilding" TEXT,
ADD COLUMN "physicalOffice" TEXT,
ADD COLUMN "physicalArchive" TEXT,
ADD COLUMN "physicalBox" TEXT,
ADD COLUMN "physicalNotes" TEXT;

CREATE INDEX "Document_status_idx" ON "Document"("status");
