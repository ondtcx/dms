-- Foundation for versioned workflow definitions and auditable executions.
CREATE TYPE "WorkflowExecutionMode" AS ENUM ('SEQUENTIAL');
CREATE TYPE "WorkflowCompletionRule" AS ENUM ('UNANIMOUS');
CREATE TYPE "WorkflowAssignmentStatus" AS ENUM ('PENDING', 'COMPLETED', 'REASSIGNED');
CREATE TYPE "WorkflowTransitionAction" AS ENUM ('SUBMIT', 'APPROVE', 'REQUEST_CHANGES', 'REJECT', 'CANCEL', 'COMPLETE', 'REASSIGN');
CREATE TYPE "WorkflowEventType" AS ENUM ('STARTED', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED', 'REASSIGNED', 'COMPLETED');

INSERT INTO "Permission" ("key", "label", "updatedAt") VALUES
  ('workflow.templates.manage', 'Gestionar plantillas de workflow', CURRENT_TIMESTAMP),
  ('workflow.view', 'Consultar workflows', CURRENT_TIMESTAMP),
  ('workflow.start', 'Iniciar workflows', CURRENT_TIMESTAMP),
  ('workflow.submit', 'Enviar documentos en workflows', CURRENT_TIMESTAMP),
  ('workflow.approve', 'Aprobar etapas de workflow', CURRENT_TIMESTAMP),
  ('workflow.request_changes', 'Solicitar cambios en workflows', CURRENT_TIMESTAMP),
  ('workflow.reject', 'Rechazar workflows', CURRENT_TIMESTAMP),
  ('workflow.cancel', 'Cancelar workflows', CURRENT_TIMESTAMP),
  ('workflow.assignments.manage', 'Administrar asignaciones de workflow', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "label" = EXCLUDED."label", "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "WorkflowTemplateVersion" (
  "id" SERIAL NOT NULL,
  "templateId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowTemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowTemplateVersion_templateId_version_key" ON "WorkflowTemplateVersion"("templateId", "version");
CREATE INDEX "WorkflowTemplateVersion_templateId_isActive_idx" ON "WorkflowTemplateVersion"("templateId", "isActive");

CREATE TABLE "WorkflowStageDefinition" (
  "id" SERIAL NOT NULL,
  "versionId" INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  "roleKey" TEXT NOT NULL,
  "executionMode" "WorkflowExecutionMode" NOT NULL DEFAULT 'SEQUENTIAL',
  "completionRule" "WorkflowCompletionRule" NOT NULL DEFAULT 'UNANIMOUS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowStageDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowStageDefinition_versionId_order_key" ON "WorkflowStageDefinition"("versionId", "order");
CREATE INDEX "WorkflowStageDefinition_roleKey_idx" ON "WorkflowStageDefinition"("roleKey");

ALTER TABLE "DocumentWorkflow"
  DROP CONSTRAINT IF EXISTS "DocumentWorkflow_documentId_key",
  ADD COLUMN "definitionVersionId" INTEGER,
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "documentVersionId" INTEGER,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "legacyReadOnly" BOOLEAN NOT NULL DEFAULT false;

-- Preserve legacy definitions and executions as immutable, read-only compatibility records.
INSERT INTO "WorkflowTemplateVersion" ("templateId", "version", "snapshot", "isActive", "updatedAt")
SELECT "id", 1, "stateDefinitions", false, CURRENT_TIMESTAMP
FROM "WorkflowTemplate";

INSERT INTO "WorkflowStageDefinition" ("versionId", "order", "roleKey")
SELECT v."id", COALESCE((stage->>'order')::INTEGER, row_number() OVER (PARTITION BY v."id" ORDER BY ordinality)::INTEGER),
       COALESCE(stage->>'roleKey', stage->>'role', stage->>'assigneeRole', 'legacy')
FROM "WorkflowTemplateVersion" v
JOIN "WorkflowTemplate" t ON t."id" = v."templateId"
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(t."stateDefinitions") = 'array' THEN t."stateDefinitions" ELSE '[]'::jsonb END
) WITH ORDINALITY AS stages(stage, ordinality);

UPDATE "DocumentWorkflow" w
SET "definitionVersionId" = v."id",
    "snapshot" = v."snapshot",
    "documentVersionId" = (
      SELECT dv."id"
      FROM "DocumentVersion" dv
      WHERE dv."documentId" = w."documentId"
      ORDER BY dv."version" DESC
      LIMIT 1
    ),
    "active" = w."status" NOT IN ('APPROVED', 'REJECTED', 'CANCELLED'),
    "legacyReadOnly" = true
FROM "WorkflowTemplateVersion" v
WHERE v."templateId" = w."templateId" AND v."version" = 1;

ALTER TABLE "DocumentWorkflow"
  ALTER COLUMN "definitionVersionId" SET NOT NULL,
  ALTER COLUMN "snapshot" SET NOT NULL;

CREATE INDEX "DocumentWorkflow_definitionVersionId_idx" ON "DocumentWorkflow"("definitionVersionId");
CREATE INDEX "DocumentWorkflow_documentId_active_idx" ON "DocumentWorkflow"("documentId", "active");
CREATE UNIQUE INDEX "DocumentWorkflow_one_active_per_document_key"
  ON "DocumentWorkflow"("documentId") WHERE "active" = true;

CREATE TABLE "WorkflowAssignment" (
  "id" SERIAL NOT NULL,
  "workflowId" INTEGER NOT NULL,
  "stageDefinitionId" INTEGER NOT NULL,
  "userId" TEXT NOT NULL,
  "userNameSnapshot" TEXT,
  "roleKeySnapshot" TEXT NOT NULL,
  "status" "WorkflowAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "reassignedAt" TIMESTAMP(3),
  "reassignmentReason" TEXT,
  CONSTRAINT "WorkflowAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowAssignment_workflowId_stageDefinitionId_userId_key" ON "WorkflowAssignment"("workflowId", "stageDefinitionId", "userId");
CREATE INDEX "WorkflowAssignment_workflowId_status_idx" ON "WorkflowAssignment"("workflowId", "status");
CREATE INDEX "WorkflowAssignment_userId_status_idx" ON "WorkflowAssignment"("userId", "status");

CREATE TABLE "WorkflowTransition" (
  "id" SERIAL NOT NULL,
  "workflowId" INTEGER NOT NULL,
  "assignmentId" INTEGER,
  "action" "WorkflowTransitionAction" NOT NULL,
  "fromState" TEXT,
  "toState" TEXT,
  "comment" TEXT,
  "performedById" TEXT NOT NULL,
  "documentVersionId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowTransition_workflowId_createdAt_idx" ON "WorkflowTransition"("workflowId", "createdAt");
CREATE INDEX "WorkflowTransition_assignmentId_idx" ON "WorkflowTransition"("assignmentId");
CREATE INDEX "WorkflowTransition_performedById_idx" ON "WorkflowTransition"("performedById");

CREATE TABLE "WorkflowEvent" (
  "id" SERIAL NOT NULL,
  "workflowId" INTEGER NOT NULL,
  "type" "WorkflowEventType" NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowEvent_workflowId_occurredAt_idx" ON "WorkflowEvent"("workflowId", "occurredAt");
CREATE INDEX "WorkflowEvent_type_idx" ON "WorkflowEvent"("type");

ALTER TABLE "WorkflowTemplateVersion" ADD CONSTRAINT "WorkflowTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowStageDefinition" ADD CONSTRAINT "WorkflowStageDefinition_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "WorkflowTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentWorkflow" ADD CONSTRAINT "DocumentWorkflow_definitionVersionId_fkey"
  FOREIGN KEY ("definitionVersionId") REFERENCES "WorkflowTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DocumentWorkflow" ADD CONSTRAINT "DocumentWorkflow_documentVersionId_fkey"
  FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowAssignment" ADD CONSTRAINT "WorkflowAssignment_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "DocumentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowAssignment" ADD CONSTRAINT "WorkflowAssignment_stageDefinitionId_fkey"
  FOREIGN KEY ("stageDefinitionId") REFERENCES "WorkflowStageDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkflowAssignment" ADD CONSTRAINT "WorkflowAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "DocumentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "WorkflowAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_performedById_fkey"
  FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_documentVersionId_fkey"
  FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "DocumentWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
