-- El origen es independiente de la ubicación física y no permite borrar la política.
ALTER TABLE "Document" ADD COLUMN "receptionOriginDirectoryId" INTEGER;
CREATE INDEX "Document_receptionOriginDirectoryId_idx" ON "Document"("receptionOriginDirectoryId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_receptionOriginDirectoryId_fkey"
  FOREIGN KEY ("receptionOriginDirectoryId") REFERENCES "Directory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No hay FK a Document/User: las identidades y el cupo sobreviven a su eliminación.
CREATE TABLE "ReceptionSubmission" (
  "directoryId" INTEGER NOT NULL,
  "documentId" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceptionSubmission_pkey" PRIMARY KEY ("directoryId", "documentId"),
  CONSTRAINT "ReceptionSubmission_directoryId_fkey" FOREIGN KEY ("directoryId")
    REFERENCES "Directory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ReceptionSubmission_directoryId_uploadedById_idx"
  ON "ReceptionSubmission"("directoryId", "uploadedById");

-- Incluye papelera/archivo. No se puede reconstruir el historial de documentos
-- movidos o eliminados antes de activar esta funcionalidad.
UPDATE "Document" d SET "receptionOriginDirectoryId" = d."directoryId"
  FROM "Directory" folder WHERE folder.id = d."directoryId" AND folder."receptionEnabled" = TRUE;
INSERT INTO "ReceptionSubmission" ("directoryId", "documentId", "uploadedById")
  SELECT "receptionOriginDirectoryId", id, "uploadedById" FROM "Document"
  WHERE "receptionOriginDirectoryId" IS NOT NULL;

-- Una vez asignado, el origen no se publica, elimina ni sustituye implícitamente.
CREATE FUNCTION "preserve_reception_origin"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."receptionOriginDirectoryId" IS NOT NULL AND
     NEW."receptionOriginDirectoryId" IS DISTINCT FROM OLD."receptionOriginDirectoryId" THEN
    RAISE EXCEPTION 'No se puede sustituir el origen de recepción';
  END IF;
  IF OLD."receptionOriginDirectoryId" IS NOT NULL AND NEW."uploadedById" IS DISTINCT FROM OLD."uploadedById" THEN
    RAISE EXCEPTION 'No se puede sustituir el autor de una recepción';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Document_preserve_reception_origin" BEFORE UPDATE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION "preserve_reception_origin"();

CREATE FUNCTION "preserve_reception_submission"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de recepción es inmutable';
END;
$$;
CREATE TRIGGER "ReceptionSubmission_preserve_history" BEFORE UPDATE OR DELETE ON "ReceptionSubmission"
  FOR EACH ROW EXECUTE FUNCTION "preserve_reception_submission"();
