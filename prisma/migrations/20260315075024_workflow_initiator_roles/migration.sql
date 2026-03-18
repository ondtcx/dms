-- AlterTable
ALTER TABLE "WorkflowTemplate" ADD COLUMN     "allowedInitiatorRoles" JSONB NOT NULL DEFAULT '[]';
