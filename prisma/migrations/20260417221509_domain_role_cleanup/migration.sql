-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "allowedRoles" DROP NOT NULL,
ALTER COLUMN "allowedRoles" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkflowTemplate" ALTER COLUMN "stateDefinitions" DROP NOT NULL,
ALTER COLUMN "allowedInitiatorRoles" DROP NOT NULL,
ALTER COLUMN "allowedInitiatorRoles" DROP DEFAULT;

-- CreateTable
CREATE TABLE "CategoryRole" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplateInitiatorRole" (
    "id" SERIAL NOT NULL,
    "workflowTemplateId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTemplateInitiatorRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplateState" (
    "id" SERIAL NOT NULL,
    "workflowTemplateId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requiresComment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplateState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryRole_categoryId_idx" ON "CategoryRole"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryRole_roleId_idx" ON "CategoryRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRole_categoryId_roleId_key" ON "CategoryRole"("categoryId", "roleId");

-- CreateIndex
CREATE INDEX "WorkflowTemplateInitiatorRole_workflowTemplateId_idx" ON "WorkflowTemplateInitiatorRole"("workflowTemplateId");

-- CreateIndex
CREATE INDEX "WorkflowTemplateInitiatorRole_roleId_idx" ON "WorkflowTemplateInitiatorRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplateInitiatorRole_workflowTemplateId_roleId_key" ON "WorkflowTemplateInitiatorRole"("workflowTemplateId", "roleId");

-- CreateIndex
CREATE INDEX "WorkflowTemplateState_workflowTemplateId_idx" ON "WorkflowTemplateState"("workflowTemplateId");

-- CreateIndex
CREATE INDEX "WorkflowTemplateState_roleId_idx" ON "WorkflowTemplateState"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplateState_workflowTemplateId_state_key" ON "WorkflowTemplateState"("workflowTemplateId", "state");

-- AddForeignKey
ALTER TABLE "CategoryRole" ADD CONSTRAINT "CategoryRole_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRole" ADD CONSTRAINT "CategoryRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateInitiatorRole" ADD CONSTRAINT "WorkflowTemplateInitiatorRole_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateInitiatorRole" ADD CONSTRAINT "WorkflowTemplateInitiatorRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateState" ADD CONSTRAINT "WorkflowTemplateState_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplateState" ADD CONSTRAINT "WorkflowTemplateState_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
