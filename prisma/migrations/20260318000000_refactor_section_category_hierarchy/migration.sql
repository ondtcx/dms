-- Migration: refactor_section_category_hierarchy
-- Convierte la relación Section ↔ Category de independiente a jerárquica.
-- Section es ahora el padre de Category. Document ya no tiene sectionId propio.

-- ============================================================
-- PASO 1: Añadir sectionId a Category (FK hacia Section)
-- ============================================================
ALTER TABLE "Category" ADD COLUMN "sectionId" INTEGER;

ALTER TABLE "Category" ADD CONSTRAINT "Category_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "Section"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Category_sectionId_idx" ON "Category"("sectionId");

-- ============================================================
-- PASO 2: Migrar datos — poblar Category.sectionId desde context
-- ============================================================
UPDATE "Category" c SET "sectionId" = s.id
FROM "Section" s
WHERE (c.context = 'ACADEMIC'       AND s.name = 'Gestión Académica')
   OR (c.context = 'ADMINISTRATIVE' AND s.name = 'Gestión Administrativa')
   OR (c.context = 'INSTITUTIONAL'  AND s.name = 'Gestión Institucional');

-- ============================================================
-- PASO 3: Eliminar Document.sectionId (la sección se deriva de category.section)
-- ============================================================
DROP INDEX IF EXISTS "Document_sectionId_idx";

ALTER TABLE "Document" DROP COLUMN IF EXISTS "sectionId";

-- ============================================================
-- PASO 4: Eliminar Category.context (reemplazado por sectionId)
-- ============================================================
DROP INDEX IF EXISTS "Category_context_idx";

ALTER TABLE "Category" DROP COLUMN IF EXISTS "context";

-- ============================================================
-- PASO 5: Eliminar enum CategoryContext
-- ============================================================
DROP TYPE IF EXISTS "CategoryContext";
