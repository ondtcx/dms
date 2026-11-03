-- AlterTable
ALTER TABLE "DocumentAuthoring" ADD COLUMN "pageFrame" JSONB;

-- AlterTable
ALTER TABLE "DocumentContentVersion" ADD COLUMN "pageFrame" JSONB;
