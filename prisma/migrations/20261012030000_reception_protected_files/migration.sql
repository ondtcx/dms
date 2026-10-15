-- Identidades textuales opacas; SQL no conoce ni deduce la raíz de uploads.
CREATE FUNCTION "reception_file_key"(value TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE AS $$
DECLARE raw TEXT := replace(value, E'\\', '/');
  absolute BOOLEAN; part TEXT; parts TEXT[] := ARRAY[]::TEXT[]; count INTEGER; result TEXT;
BEGIN
  -- Normalización léxica, nunca realpath ni clasificación respecto a una raíz física.
  absolute := left(raw, 1) = '/' OR raw ~ '^[A-Za-z]:/';
  FOREACH part IN ARRAY string_to_array(raw, '/') LOOP
    IF part = '' OR part = '.' THEN CONTINUE; END IF;
    count := COALESCE(array_length(parts, 1), 0);
    IF part = '..' THEN
      IF count > 0 AND parts[count] <> '..' AND
        NOT (absolute AND count = 1 AND parts[1] ~ '^[A-Za-z]:$') THEN
        parts := parts[1:count-1];
      ELSIF NOT absolute THEN parts := array_append(parts, part);
      END IF;
    ELSE parts := array_append(parts, part);
    END IF;
  END LOOP;
  result := CASE WHEN left(raw, 1) = '/' THEN '/' ELSE '' END || array_to_string(parts, '/');
  IF absolute AND array_length(parts, 1) = 1 AND parts[1] ~ '^[A-Za-z]:$' THEN result := result || '/'; END IF;
  IF result = '' THEN RETURN CASE WHEN absolute THEN '/' ELSE '.' END; END IF;
  RETURN result;
END;
$$;

CREATE TABLE "ProtectedReceptionFile" (
  "id" SERIAL NOT NULL,
  "directoryId" INTEGER NOT NULL,
  "documentId" INTEGER NOT NULL,
  "rawPath" TEXT NOT NULL,
  "rawHash" VARCHAR(32) NOT NULL,
  "normalizedKey" TEXT NOT NULL,
  "normalizedHash" VARCHAR(32) NOT NULL,
  "foldedKey" TEXT NOT NULL,
  "foldedHash" VARCHAR(32) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProtectedReceptionFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProtectedReceptionFile_directoryId_fkey" FOREIGN KEY ("directoryId")
    REFERENCES "Directory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Hashes acotan los índices incluso para rutas largas; siempre se compara también el texto.
CREATE UNIQUE INDEX "ProtectedReceptionFile_directoryId_documentId_rawHash_key"
  ON "ProtectedReceptionFile"("directoryId", "documentId", "rawHash");
CREATE INDEX "ProtectedReceptionFile_normalizedHash_idx" ON "ProtectedReceptionFile"("normalizedHash");
CREATE INDEX "ProtectedReceptionFile_foldedHash_idx" ON "ProtectedReceptionFile"("foldedHash");
CREATE INDEX "ProtectedReceptionFile_documentId_idx" ON "ProtectedReceptionFile"("documentId");
CREATE INDEX "ReceptionSubmission_documentId_idx" ON "ReceptionSubmission"("documentId");
-- "Document" no almacena rutas; sólo "DocumentVersion.path" las conserva. No se indexa path sobre Document.
CREATE INDEX "DocumentVersion_reception_file_key_idx" ON "DocumentVersion"(md5("reception_file_key"(path)));
CREATE INDEX "DocumentVersion_reception_file_folded_idx" ON "DocumentVersion"(md5(lower("reception_file_key"(path))));

CREATE FUNCTION "capture_reception_file"(folder_id INTEGER, document_id INTEGER, stored_path TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE normalized TEXT;
BEGIN
  IF folder_id IS NULL OR stored_path IS NULL THEN RETURN; END IF;
  normalized := "reception_file_key"(stored_path);
  INSERT INTO "ProtectedReceptionFile"
    ("directoryId", "documentId", "rawPath", "rawHash", "normalizedKey", "normalizedHash", "foldedKey", "foldedHash")
    VALUES (folder_id, document_id, stored_path, md5(stored_path), normalized, md5(normalized), lower(normalized), md5(lower(normalized)))
    ON CONFLICT ("directoryId", "documentId", "rawHash") DO NOTHING;
  -- Una colisión no puede descartar silenciosamente una identidad protegida.
  IF NOT EXISTS (SELECT 1 FROM "ProtectedReceptionFile"
    WHERE "directoryId" = folder_id AND "documentId" = document_id
      AND "rawHash" = md5(stored_path) AND "rawPath" = stored_path) THEN
    RAISE EXCEPTION 'No se pudo conservar la identidad protegida del archivo';
  END IF;
END;
$$;

CREATE FUNCTION "capture_reception_document_files"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_origin INTEGER; new_origin INTEGER; version_path TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_origin := OLD."receptionOriginDirectoryId";
    IF old_origin IS NULL THEN
      SELECT id INTO old_origin FROM "Directory" WHERE id = OLD."directoryId" AND "receptionEnabled" = TRUE;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_origin := NEW."receptionOriginDirectoryId";
    IF new_origin IS NULL THEN
      SELECT id INTO new_origin FROM "Directory" WHERE id = NEW."directoryId" AND "receptionEnabled" = TRUE;
    END IF;
  END IF;
  -- "Document" no tiene ruta propia: toda ruta histórica vive en "DocumentVersion".
  IF TG_OP <> 'INSERT' THEN
    FOR version_path IN SELECT path FROM "DocumentVersion" WHERE "documentId" = OLD.id LOOP
      PERFORM "capture_reception_file"(COALESCE(old_origin, new_origin), OLD.id, version_path);
    END LOOP;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    FOR version_path IN SELECT path FROM "DocumentVersion" WHERE "documentId" = NEW.id LOOP
      PERFORM "capture_reception_file"(COALESCE(new_origin, old_origin), NEW.id, version_path);
    END LOOP;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
-- BEFORE DELETE conserva versiones antes de la cascada; captura también rutas anteriores.
CREATE TRIGGER "Document_capture_reception_files" BEFORE INSERT OR UPDATE OR DELETE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION "capture_reception_document_files"();

CREATE FUNCTION "capture_reception_version_files"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_record RECORD; old_id INTEGER; new_id INTEGER;
  origin_id INTEGER; old_origin INTEGER; new_origin INTEGER;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_id := OLD."documentId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_id := NEW."documentId"; END IF;
  -- Serializa las versiones con la asignación del origen: ningún llamador registra rutas manualmente.
  FOR parent_record IN SELECT d.* FROM "Document" d
    WHERE d.id IN (old_id, new_id) ORDER BY d.id FOR UPDATE LOOP
    origin_id := parent_record."receptionOriginDirectoryId";
    IF origin_id IS NULL THEN
      SELECT id INTO origin_id FROM "Directory"
        WHERE id = parent_record."directoryId" AND "receptionEnabled" = TRUE;
    END IF;
    IF parent_record.id = old_id THEN old_origin := origin_id; END IF;
    IF parent_record.id = new_id THEN new_origin := origin_id; END IF;
  END LOOP;
  -- Un cambio simultáneo de padre/ruta tampoco publica el alias anterior o nuevo.
  IF TG_OP <> 'INSERT' THEN
    PERFORM "capture_reception_file"(COALESCE(old_origin, new_origin), old_id, OLD.path);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM "capture_reception_file"(COALESCE(new_origin, old_origin), new_id, NEW.path);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "DocumentVersion_capture_reception_files" BEFORE INSERT OR UPDATE OR DELETE ON "DocumentVersion"
  FOR EACH ROW EXECUTE FUNCTION "capture_reception_version_files"();

-- Rellena sólo rutas de versiones existentes (la ruta real del documento); sin filtros de papelera/archivo ni inventario de huérfanos previos.
SELECT "capture_reception_file"(COALESCE(d."receptionOriginDirectoryId", f.id), d.id, v.path)
  FROM "DocumentVersion" v JOIN "Document" d ON d.id = v."documentId"
  LEFT JOIN "Directory" f ON f.id = d."directoryId" AND f."receptionEnabled" = TRUE
  WHERE d."receptionOriginDirectoryId" IS NOT NULL OR f.id IS NOT NULL;

CREATE FUNCTION "preserve_reception_file_history"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de archivos de recepción es inmutable';
END;
$$;
CREATE TRIGGER "ProtectedReceptionFile_preserve_history" BEFORE UPDATE OR DELETE ON "ProtectedReceptionFile"
  FOR EACH ROW EXECUTE FUNCTION "preserve_reception_file_history"();
