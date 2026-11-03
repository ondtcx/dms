-- CreateEnum
CREATE TYPE "TemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AuthoringStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'EMITTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuthoringAction" AS ENUM ('CREATED', 'SAVED', 'SUBMITTED', 'APPROVED', 'RETURNED', 'EMITTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentVersionReason" AS ENUM ('DRAFT_SAVE', 'SENT_TO_REVIEW', 'RETURNED', 'APPROVED', 'EMITTED');

-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN "catalog" TEXT NOT NULL DEFAULT 'legacy';

-- AlterTable
ALTER TABLE "DocumentTemplateData" ADD COLUMN "templateVersionId" INTEGER;

-- CreateTable
CREATE TABLE "DocumentTemplateVersion" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "bodyHtml" TEXT NOT NULL,
    "styles" TEXT,
    "fields" JSONB NOT NULL,
    "pageSize" TEXT NOT NULL DEFAULT 'A4',
    "orientation" TEXT NOT NULL DEFAULT 'portrait',
    "numberPrefix" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAuthoring" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "templateVersionId" INTEGER,
    "status" "AuthoringStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewObservation" TEXT,
    "emittedAt" TIMESTAMP(3),
    "emittedById" TEXT,
    "emittedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAuthoring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAuthoringEvent" (
    "id" SERIAL NOT NULL,
    "authoringId" INTEGER NOT NULL,
    "action" "AuthoringAction" NOT NULL,
    "fromStatus" "AuthoringStatus",
    "toStatus" "AuthoringStatus" NOT NULL,
    "observation" TEXT,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAuthoringEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentContentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "formData" JSONB NOT NULL,
    "htmlSnapshot" TEXT NOT NULL,
    "reason" "ContentVersionReason" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplateVersion_templateId_status_idx" ON "DocumentTemplateVersion"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAuthoring_documentId_key" ON "DocumentAuthoring"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAuthoring_status_idx" ON "DocumentAuthoring"("status");

-- CreateIndex
CREATE INDEX "DocumentAuthoring_reviewerId_idx" ON "DocumentAuthoring"("reviewerId");

-- CreateIndex
CREATE INDEX "DocumentAuthoring_templateVersionId_idx" ON "DocumentAuthoring"("templateVersionId");

-- CreateIndex
CREATE INDEX "DocumentAuthoringEvent_authoringId_idx" ON "DocumentAuthoringEvent"("authoringId");

-- CreateIndex
CREATE INDEX "DocumentAuthoringEvent_createdAt_idx" ON "DocumentAuthoringEvent"("createdAt");

-- CreateIndex
CREATE INDEX "DocumentContentVersion_documentId_idx" ON "DocumentContentVersion"("documentId");

-- CreateIndex
CREATE INDEX "DocumentContentVersion_createdAt_idx" ON "DocumentContentVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentContentVersion_documentId_version_key" ON "DocumentContentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentTemplate_catalog_idx" ON "DocumentTemplate"("catalog");

-- CreateIndex
CREATE INDEX "DocumentTemplateData_templateVersionId_idx" ON "DocumentTemplateData"("templateVersionId");

-- AddForeignKey
ALTER TABLE "DocumentTemplateVersion" ADD CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuthoring" ADD CONSTRAINT "DocumentAuthoring_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuthoring" ADD CONSTRAINT "DocumentAuthoring_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuthoringEvent" ADD CONSTRAINT "DocumentAuthoringEvent_authoringId_fkey" FOREIGN KEY ("authoringId") REFERENCES "DocumentAuthoring"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentContentVersion" ADD CONSTRAINT "DocumentContentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplateData" ADD CONSTRAINT "DocumentTemplateData_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
