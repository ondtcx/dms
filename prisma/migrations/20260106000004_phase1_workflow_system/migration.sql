-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('APPROVED', 'REJECTED', 'REQUESTED_CHANGES', 'COMMENTED');

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "documentType" TEXT,
    "categoryId" INTEGER,
    "stateDefinitions" JSONB NOT NULL,
    "autoAssign" BOOLEAN NOT NULL DEFAULT true,
    "requiresComment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentWorkflow" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "templateId" INTEGER NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "currentState" TEXT NOT NULL,
    "currentStateOrder" INTEGER NOT NULL DEFAULT 0,
    "initiatedById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowApproval" (
    "id" SERIAL NOT NULL,
    "workflowId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "stateOrder" INTEGER NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_name_key" ON "WorkflowTemplate"("name");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_documentType_idx" ON "WorkflowTemplate"("documentType");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_categoryId_idx" ON "WorkflowTemplate"("categoryId");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_isActive_idx" ON "WorkflowTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentWorkflow_documentId_key" ON "DocumentWorkflow"("documentId");

-- CreateIndex
CREATE INDEX "DocumentWorkflow_documentId_idx" ON "DocumentWorkflow"("documentId");

-- CreateIndex
CREATE INDEX "DocumentWorkflow_templateId_idx" ON "DocumentWorkflow"("templateId");

-- CreateIndex
CREATE INDEX "DocumentWorkflow_status_idx" ON "DocumentWorkflow"("status");

-- CreateIndex
CREATE INDEX "DocumentWorkflow_currentState_idx" ON "DocumentWorkflow"("currentState");

-- CreateIndex
CREATE INDEX "DocumentWorkflow_initiatedById_idx" ON "DocumentWorkflow"("initiatedById");

-- CreateIndex
CREATE INDEX "WorkflowApproval_workflowId_idx" ON "WorkflowApproval"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_userId_idx" ON "WorkflowApproval"("userId");

-- CreateIndex
CREATE INDEX "WorkflowApproval_state_idx" ON "WorkflowApproval"("state");

-- CreateIndex
CREATE INDEX "WorkflowApproval_action_idx" ON "WorkflowApproval"("action");

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentWorkflow" ADD CONSTRAINT "DocumentWorkflow_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentWorkflow" ADD CONSTRAINT "DocumentWorkflow_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentWorkflow" ADD CONSTRAINT "DocumentWorkflow_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "DocumentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
