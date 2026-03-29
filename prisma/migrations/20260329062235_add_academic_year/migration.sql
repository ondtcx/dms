-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "bypassAcademicYear" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "academicYearId" INTEGER;

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_name_key" ON "AcademicYear"("name");

-- CreateIndex
CREATE INDEX "AcademicYear_isCurrent_idx" ON "AcademicYear"("isCurrent");

-- CreateIndex
CREATE INDEX "AcademicYear_isActive_idx" ON "AcademicYear"("isActive");

-- CreateIndex
CREATE INDEX "Document_academicYearId_idx" ON "Document"("academicYearId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Garantizar que solo un año lectivo puede tener isCurrent = true a la vez
-- (refuerzo a nivel de base de datos, independiente de la lógica de la aplicación)
CREATE UNIQUE INDEX "unique_one_current_year" ON "AcademicYear" ("isCurrent") WHERE "isCurrent" = true;

-- Marcar categorías Legales y Financieros para que sus documentos ignoren el filtro de año lectivo
UPDATE "Category" SET "bypassAcademicYear" = true WHERE name IN ('Legales', 'Financieros');
