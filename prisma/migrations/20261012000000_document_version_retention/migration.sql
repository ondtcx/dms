-- Metadatos aditivos; esta migración no elimina registros ni archivos.
ALTER TABLE "DocumentVersion"
  ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "retentionGraceUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preservePermanently" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preserveUntil" TIMESTAMP(3);

-- Las versiones antiguas reciben treinta días completos desde el despliegue.
-- Reejecutar no modifica la fecha de una versión ya inicializada.
UPDATE "DocumentVersion" AS v
SET "supersededAt" = CURRENT_TIMESTAMP,
    "retentionGraceUntil" = GREATEST(
      COALESCE(v."retentionGraceUntil", CURRENT_TIMESTAMP + INTERVAL '30 days'),
      CURRENT_TIMESTAMP + INTERVAL '30 days'
    )
FROM "Document" AS d
WHERE d.id = v."documentId"
  AND v.version <> d."currentVersion"
  AND v."supersededAt" IS NULL;

CREATE INDEX IF NOT EXISTS "DocumentVersion_supersededAt_id_idx"
  ON "DocumentVersion" ("supersededAt", id);
CREATE INDEX IF NOT EXISTS "DocumentVersion_path_idx"
  ON "DocumentVersion" (path);
