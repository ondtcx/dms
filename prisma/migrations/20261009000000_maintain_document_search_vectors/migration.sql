-- Leer sin bloquear el padre; validar concurrencia en PostgreSQL antes del despliegue.
CREATE FUNCTION document_search_vector(target integer, content text) RETURNS tsvector
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  parent "Document"%ROWTYPE;
  filename text;
BEGIN
  SELECT * INTO parent FROM "Document" WHERE id = target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT v.filename INTO filename FROM "DocumentVersion" v WHERE "documentId" = target
    ORDER BY "createdAt" DESC, id DESC LIMIT 1;
  RETURN setweight(to_tsvector('spanish', coalesce(parent.name, '') || ' ' || coalesce(filename, '')), 'A')
    || setweight(to_tsvector('spanish', coalesce(parent.description, '')), 'B')
    || setweight(to_tsvector('spanish', coalesce(content, '')), 'C');
END;
$$;

CREATE FUNCTION set_document_search_vector() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."searchVector" := document_search_vector(NEW."documentId", NEW."extractedText");
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_search_vector_write
BEFORE INSERT OR UPDATE ON "DocumentSearch"
FOR EACH ROW EXECUTE FUNCTION set_document_search_vector();

CREATE FUNCTION refresh_document_search(target integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  vector tsvector;
BEGIN
  -- Serializar en la fila de búsqueda antes de leer entradas en otra sentencia.
  PERFORM id FROM "DocumentSearch" WHERE "documentId" = target FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    -- Proteger solo la creación frente al borrado del padre; conservar el texto existente.
    PERFORM id FROM "Document" WHERE id = target FOR KEY SHARE;
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO "DocumentSearch" ("documentId") VALUES (target)
      ON CONFLICT ("documentId") DO NOTHING;
    PERFORM id FROM "DocumentSearch" WHERE "documentId" = target FOR NO KEY UPDATE;
  END IF;
  SELECT document_search_vector(target, "extractedText") INTO vector
    FROM "DocumentSearch" WHERE "documentId" = target;
  UPDATE "DocumentSearch" SET "searchVector" = vector
    WHERE "documentId" = target AND "searchVector" IS DISTINCT FROM vector;
END;
$$;

CREATE FUNCTION refresh_document_search_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Document' THEN
    PERFORM refresh_document_search(NEW.id);
  ELSE
    IF TG_OP = 'DELETE' THEN
      PERFORM refresh_document_search(OLD."documentId");
    ELSE
      IF TG_OP = 'UPDATE' AND OLD."documentId" IS DISTINCT FROM NEW."documentId" THEN
        PERFORM refresh_document_search(OLD."documentId");
      END IF;
      PERFORM refresh_document_search(NEW."documentId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Diferir evita competir con search.create anidado; no forzar restricciones inmediatas durante la creación.
CREATE CONSTRAINT TRIGGER document_search_parent_refresh
AFTER INSERT OR UPDATE ON "Document"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION refresh_document_search_event();

CREATE CONSTRAINT TRIGGER document_search_version_refresh
AFTER INSERT OR UPDATE OR DELETE ON "DocumentVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION refresh_document_search_event();

-- Conservar extractedText y reutilizar el índice GIN existente.
SELECT refresh_document_search(id) FROM "Document" ORDER BY id;
