BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- El bloqueo impide cambios concurrentes en la base del cierre hasta finalizar.
-- Rechazar ciclos antes del DDL evita aceptar un cierre parcial del árbol existente.
LOCK TABLE "Directory" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE parents AS (
      SELECT id, "parentId", ARRAY[id] AS visited, FALSE AS cycle FROM "Directory"
      UNION ALL
      SELECT d.id, d."parentId", p.visited || d.id, d.id = ANY(p.visited)
      FROM parents p JOIN "Directory" d ON d.id = p."parentId" WHERE NOT p.cycle
    ) SELECT 1 FROM parents WHERE cycle
  ) THEN RAISE EXCEPTION 'Jerarquía de carpetas inválida' USING ERRCODE = '23514'; END IF;
END $$;

ALTER TABLE "Directory" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "DocumentPermission" ADD COLUMN "canUploadVersion" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "DirectoryAncestor" (
  "ancestorId" INTEGER NOT NULL REFERENCES "Directory"(id) ON DELETE CASCADE,
  "descendantId" INTEGER NOT NULL REFERENCES "Directory"(id) ON DELETE CASCADE,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  PRIMARY KEY ("ancestorId", "descendantId")
);
CREATE INDEX "DirectoryAncestor_descendantId_ancestorId_idx" ON "DirectoryAncestor"("descendantId", "ancestorId");

-- La jerarquía, incluidos movimientos y contenido futuro, se resuelve en SQL.
-- Las escrituras estructurales son Serializable; el bloqueo serializa el cierre.
CREATE FUNCTION refresh_directory_ancestry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(61014010000);
  IF EXISTS (
    WITH RECURSIVE parents AS (
      SELECT id, "parentId", ARRAY[id] AS visited, FALSE AS cycle FROM "Directory"
      UNION ALL
      SELECT d.id, d."parentId", p.visited || d.id, d.id = ANY(p.visited)
      FROM parents p JOIN "Directory" d ON d.id = p."parentId" WHERE NOT p.cycle
    ) SELECT 1 FROM parents WHERE cycle
  ) THEN RAISE EXCEPTION 'Jerarquía de carpetas inválida' USING ERRCODE = '23514'; END IF;
  DELETE FROM "DirectoryAncestor";
  INSERT INTO "DirectoryAncestor" ("ancestorId", "descendantId", depth)
  WITH RECURSIVE tree AS (
    SELECT id AS ancestor, id AS descendant, 0 AS depth, ARRAY[id] AS visited FROM "Directory"
    UNION ALL
    SELECT t.ancestor, d.id, t.depth + 1, t.visited || d.id
    FROM tree t JOIN "Directory" d ON d."parentId" = t.descendant
    WHERE NOT d.id = ANY(t.visited)
  ) SELECT ancestor, descendant, depth FROM tree;
  RETURN NULL;
END $$;
CREATE TRIGGER directory_ancestry_refresh AFTER INSERT OR UPDATE OF "parentId" OR DELETE ON "Directory"
FOR EACH STATEMENT EXECUTE FUNCTION refresh_directory_ancestry();
INSERT INTO "DirectoryAncestor" ("ancestorId", "descendantId", depth)
WITH RECURSIVE tree AS (
  SELECT id AS ancestor, id AS descendant, 0 AS depth, ARRAY[id] AS visited FROM "Directory"
  UNION ALL
  SELECT t.ancestor, d.id, t.depth + 1, t.visited || d.id
  FROM tree t JOIN "Directory" d ON d."parentId" = t.descendant
  WHERE NOT d.id = ANY(t.visited)
) SELECT ancestor, descendant, depth FROM tree;

CREATE TABLE "AccessGrant" (
  id SERIAL PRIMARY KEY,
  "directoryId" INTEGER REFERENCES "Directory"(id) ON DELETE CASCADE,
  "documentId" INTEGER REFERENCES "Document"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "grantedById" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "parentGrantId" INTEGER REFERENCES "AccessGrant"(id) ON DELETE CASCADE,
  "authorityDirectoryId" INTEGER REFERENCES "Directory"(id) ON DELETE CASCADE,
  "canView" BOOLEAN NOT NULL DEFAULT TRUE,
  "canEdit" BOOLEAN NOT NULL DEFAULT FALSE,
  "canUploadVersion" BOOLEAN NOT NULL DEFAULT FALSE,
  "canShare" BOOLEAN NOT NULL DEFAULT FALSE,
  "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("directoryId" IS NULL) <> ("documentId" IS NULL)),
  CHECK ("userId" <> "grantedById"), CHECK ("canView" = TRUE)
);
CREATE INDEX "AccessGrant_directoryId_userId_idx" ON "AccessGrant"("directoryId", "userId");
CREATE INDEX "AccessGrant_documentId_userId_idx" ON "AccessGrant"("documentId", "userId");
CREATE INDEX "AccessGrant_parentGrantId_idx" ON "AccessGrant"("parentGrantId");

-- Toda delegación conserva una fuente concreta. Revocar, expirar o mover fuera
-- de esa fuente invalida también las delegaciones, sin copiar permisos al destino.
CREATE VIEW "EffectiveAccessGrant" AS
WITH RECURSIVE candidates AS (
  SELECT g.*, COALESCE(g."directoryId", d."directoryId") AS location,
    COALESCE(f."createdById", d."uploadedById") AS owner
  FROM "AccessGrant" g
  LEFT JOIN "Document" d ON d.id = g."documentId"
  LEFT JOIN "Directory" f ON f.id = g."directoryId"
  LEFT JOIN "Directory" df ON df.id = d."directoryId"
  WHERE g."revokedAt" IS NULL AND (g."expiresAt" IS NULL OR g."expiresAt" >= statement_timestamp())
    AND COALESCE(f."receptionEnabled", FALSE) = FALSE
    AND COALESCE(df."receptionEnabled", FALSE) = FALSE
    AND d."receptionOriginDirectoryId" IS NULL AND d."deletedAt" IS NULL
), live AS (
  SELECT c.*, c.id AS "sourceGrantId", COALESCE(c."directoryId", c."authorityDirectoryId") AS "sourceDirectoryId"
  FROM candidates c WHERE c."parentGrantId" IS NULL AND (
    (c."authorityDirectoryId" IS NULL AND c.owner = c."grantedById") OR EXISTS (
      SELECT 1 FROM "DirectoryAncestor" a JOIN "Directory" f ON f.id = a."ancestorId"
      WHERE a."descendantId" = c.location AND f.id = c."authorityDirectoryId"
        AND f."createdById" = c."grantedById" AND NOT f."receptionEnabled"
    )
  )
  UNION ALL
  SELECT c.*, p."sourceGrantId", p."sourceDirectoryId" FROM candidates c JOIN live p ON p.id = c."parentGrantId"
  WHERE p."userId" = c."grantedById" AND p."canShare"
    AND (NOT c."canEdit" OR p."canEdit")
    AND (NOT c."canUploadVersion" OR p."canUploadVersion")
    AND (NOT c."canShare" OR p."canShare")
    AND ((p."documentId" IS NOT NULL AND p."documentId" = c."documentId") OR
      (p."directoryId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "DirectoryAncestor" a WHERE a."ancestorId" = p."directoryId" AND a."descendantId" = c.location
      )))
)
SELECT id, "directoryId", "documentId", "userId", "grantedById", "parentGrantId", "authorityDirectoryId",
  "sourceGrantId", "sourceDirectoryId",
  "canView", "canEdit", "canUploadVersion", "canShare", "expiresAt", "createdAt" FROM live;

COMMIT;
