-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'VIEW',
  'DOWNLOAD',
  'SHARE',
  'REVOKE',
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'REQUEST_CHANGES',
  'CANCEL',
  'COMPLETE',
  'REASSIGN',
  'RESTORE',
  'ARCHIVE',
  'LOGIN',
  'LOGOUT'
);

-- CreateEnum
CREATE TYPE "AuditResource" AS ENUM (
  'DOCUMENT',
  'DOCUMENT_VERSION',
  'DOCUMENT_TEMPLATE',
  'WORKFLOW',
  'USER',
  'ROLE',
  'PERMISSION',
  'DIRECTORY',
  'CATEGORY',
  'SECTION',
  'SHARE',
  'SESSION',
  'SYSTEM'
);

-- CreateTable
-- Append-only trail: no foreign keys so the record survives actor/document deletion.
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "action" "AuditAction" NOT NULL,
  "resource" "AuditResource" NOT NULL,
  "resourceId" TEXT,
  "documentId" INTEGER,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "actorRole" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "requestId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_documentId_idx" ON "AuditLog"("documentId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");
