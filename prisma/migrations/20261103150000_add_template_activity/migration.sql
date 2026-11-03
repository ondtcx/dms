CREATE TYPE "DocumentTemplateActivityAction" AS ENUM (
  'CREATED', 'UPDATED', 'VERSION_CREATED', 'VERSION_PUBLISHED',
  'VERSION_RETIRED', 'DEACTIVATED', 'DUPLICATED'
);

CREATE TABLE "DocumentTemplateActivity" (
  "id" SERIAL NOT NULL,
  "templateId" INTEGER NOT NULL,
  "versionId" INTEGER,
  "action" "DocumentTemplateActivityAction" NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplateActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentTemplateActivity_templateId_createdAt_idx"
  ON "DocumentTemplateActivity"("templateId", "createdAt");
CREATE INDEX "DocumentTemplateActivity_versionId_idx"
  ON "DocumentTemplateActivity"("versionId");

ALTER TABLE "DocumentTemplateActivity"
  ADD CONSTRAINT "DocumentTemplateActivity_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTemplateActivity"
  ADD CONSTRAINT "DocumentTemplateActivity_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "DocumentTemplateVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "DocumentTemplateActivity"
  ("templateId", "versionId", "action", "actorId", "actorName", "metadata", "createdAt")
SELECT t."id", NULL, 'CREATED', t."createdById", u."name",
       jsonb_build_object('name', t."name"), t."createdAt"
FROM "DocumentTemplate" t
JOIN "User" u ON u."id" = t."createdById"
WHERE t."catalog" = 'institutional';

INSERT INTO "DocumentTemplateActivity"
  ("templateId", "versionId", "action", "actorId", "actorName", "metadata", "createdAt")
SELECT v."templateId", v."id", 'VERSION_CREATED', v."createdById", u."name",
       jsonb_build_object('version', v."version"), v."createdAt"
FROM "DocumentTemplateVersion" v
JOIN "DocumentTemplate" t ON t."id" = v."templateId"
JOIN "User" u ON u."id" = v."createdById"
WHERE t."catalog" = 'institutional';

INSERT INTO "DocumentTemplateActivity"
  ("templateId", "versionId", "action", "actorId", "actorName", "metadata", "createdAt")
SELECT v."templateId", v."id", 'VERSION_PUBLISHED', v."publishedById", v."publishedByName",
       jsonb_build_object('version', v."version"), COALESCE(v."publishedAt", v."createdAt")
FROM "DocumentTemplateVersion" v
JOIN "DocumentTemplate" t ON t."id" = v."templateId"
WHERE t."catalog" = 'institutional'
  AND v."publishedById" IS NOT NULL;
