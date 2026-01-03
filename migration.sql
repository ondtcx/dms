-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_deletedById_fkey";

-- DropForeignKey
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_createdById_fkey";

-- DropForeignKey
ALTER TABLE "DocumentAccess" DROP CONSTRAINT "DocumentAccess_documentId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentAccess" DROP CONSTRAINT "DocumentAccess_userId_fkey";

-- DropIndex
DROP INDEX "Document_deletedAt_idx";

-- DropIndex
DROP INDEX "Document_createdAt_idx";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "checksumSHA256",
DROP COLUMN "currentVersion",
DROP COLUMN "deletedAt",
DROP COLUMN "deletedById";

-- DropTable
DROP TABLE "DocumentVersion";

-- DropTable
DROP TABLE "DocumentAccess";

