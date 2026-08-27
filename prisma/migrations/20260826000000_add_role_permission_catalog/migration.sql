-- Additive catalog migration. Legacy enum columns remain authoritative during rollout.
CREATE TABLE "Role" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "legacyRole" "UserRole",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE UNIQUE INDEX "Role_legacyRole_key" ON "Role"("legacyRole");
CREATE INDEX "Role_isActive_idx" ON "Role"("isActive");

CREATE TABLE "Permission" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "Permission_isActive_idx" ON "Permission"("isActive");

CREATE TABLE "RolePermission" (
  "roleId" INTEGER NOT NULL,
  "permissionId" INTEGER NOT NULL,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

CREATE TABLE "UserRoleAssignment" (
  "userId" TEXT NOT NULL,
  "roleId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("userId", "roleId")
);
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

ALTER TABLE "User" ADD COLUMN "authRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DocumentPermission" ADD COLUMN "roleId" INTEGER;
ALTER TABLE "DocumentShare" ADD COLUMN "roleId" INTEGER;
CREATE INDEX "DocumentPermission_roleId_idx" ON "DocumentPermission"("roleId");
CREATE INDEX "DocumentShare_roleId_idx" ON "DocumentShare"("roleId");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Role" ("key", "label", "isSystem", "legacyRole", "updatedAt") VALUES
  ('rector', 'Rector', true, 'rector', CURRENT_TIMESTAMP),
  ('vicerrector', 'Vicerrector', true, 'vicerrector', CURRENT_TIMESTAMP),
  ('coordinador', 'Coordinador', true, 'coordinador', CURRENT_TIMESTAMP),
  ('profesor', 'Profesor', true, 'profesor', CURRENT_TIMESTAMP),
  ('secretario', 'Secretario', true, 'secretario', CURRENT_TIMESTAMP),
  ('padre', 'Padre', true, 'padre', CURRENT_TIMESTAMP),
  ('estudiante', 'Estudiante', true, 'estudiante', CURRENT_TIMESTAMP),
  ('moderador', 'Moderador', true, 'moderador', CURRENT_TIMESTAMP),
  ('admin', 'Administrador', true, 'admin', CURRENT_TIMESTAMP),
  ('user', 'Usuario', true, 'user', CURRENT_TIMESTAMP);

INSERT INTO "Permission" ("key", "label", "updatedAt") VALUES
  ('users.manage', 'Gestionar usuarios', CURRENT_TIMESTAMP),
  ('categories.manage', 'Gestionar categorías', CURRENT_TIMESTAMP),
  ('document-types.manage', 'Gestionar tipos de documento', CURRENT_TIMESTAMP),
  ('templates.manage', 'Gestionar plantillas', CURRENT_TIMESTAMP),
  ('roles.manage', 'Gestionar roles y permisos', CURRENT_TIMESTAMP);

INSERT INTO "UserRoleAssignment" ("userId", "roleId")
SELECT u."id", r."id" FROM "User" u JOIN "Role" r ON r."legacyRole" = u."role"
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p WHERE r."key" = 'admin'
ON CONFLICT DO NOTHING;

DO $$
DECLARE unmapped TEXT;
BEGIN
  SELECT string_agg(DISTINCT u."role"::TEXT, ', ' ORDER BY u."role"::TEXT)
    INTO unmapped FROM "User" u LEFT JOIN "Role" r ON r."legacyRole" = u."role"
    WHERE r."id" IS NULL;
  IF unmapped IS NOT NULL THEN
    RAISE WARNING 'Unmapped legacy roles found; catalog authorization must remain disabled: %', unmapped;
  END IF;
END $$;
