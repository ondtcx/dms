-- AlterTable DocumentTemplate - Add fields for predefined templates
ALTER TABLE "DocumentTemplate" ADD COLUMN "category" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "isPredefined" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DocumentTemplate" ADD COLUMN "previewImageUrl" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DocumentTemplate" ADD COLUMN "variableSchema" JSONB;

-- CreateIndex for category
CREATE INDEX "DocumentTemplate_category_idx" ON "DocumentTemplate"("category");

-- CreateIndex for isPredefined
CREATE INDEX "DocumentTemplate_isPredefined_idx" ON "DocumentTemplate"("isPredefined");

-- CreateIndex for usageCount
CREATE INDEX "DocumentTemplate_usageCount_idx" ON "DocumentTemplate"("usageCount");
