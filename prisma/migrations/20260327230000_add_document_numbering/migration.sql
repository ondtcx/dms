-- AlterTable
ALTER TABLE "Category" ADD COLUMN "prefix" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "documentNumber" TEXT;

-- AlterTable
ALTER TABLE "Section" ADD COLUMN "prefix" TEXT;

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "id" SERIAL NOT NULL,
    "sectionPrefix" TEXT NOT NULL,
    "categoryPrefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentCounter_year_idx" ON "DocumentCounter"("year");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCounter_sectionPrefix_categoryPrefix_year_key" ON "DocumentCounter"("sectionPrefix", "categoryPrefix", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Document_documentNumber_key" ON "Document"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Section_prefix_key" ON "Section"("prefix");
