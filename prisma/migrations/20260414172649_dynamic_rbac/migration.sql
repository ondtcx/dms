-- CreateTable Role
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable Permission
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable _PermissionToRole
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE UNIQUE INDEX "Permission_action_key" ON "Permission"("action");
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- Add Columns
ALTER TABLE "DocumentPermission" ADD COLUMN "roleId" TEXT;
ALTER TABLE "DocumentShare" ADD COLUMN "roleId" TEXT;
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;

-- Migrate Data: Insert enum values into Role
INSERT INTO "Role" ("id", "name", "description", "isSystem", "updatedAt")
SELECT gen_random_uuid()::text, unnest(enum_range(NULL::"UserRole"))::text, 'Migrated role', true, CURRENT_TIMESTAMP
ON CONFLICT ("name") DO NOTHING;

-- Map User.roleId
UPDATE "User"
SET "roleId" = "Role"."id"
FROM "Role"
WHERE CAST("User"."role" AS TEXT) = "Role"."name";

-- Map DocumentPermission.roleId
UPDATE "DocumentPermission"
SET "roleId" = "Role"."id"
FROM "Role"
WHERE CAST("DocumentPermission"."role" AS TEXT) = "Role"."name";

-- Map DocumentShare.roleId
UPDATE "DocumentShare"
SET "roleId" = "Role"."id"
FROM "Role"
WHERE CAST("DocumentShare"."role" AS TEXT) = "Role"."name";

-- Drop old indices and columns
DROP INDEX IF EXISTS "DocumentPermission_role_idx";
DROP INDEX IF EXISTS "DocumentShare_role_idx";

ALTER TABLE "DocumentPermission" DROP COLUMN "role";
ALTER TABLE "DocumentShare" DROP COLUMN "role";
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "UserRole";

-- Create new indices
CREATE INDEX "DocumentPermission_roleId_idx" ON "DocumentPermission"("roleId");
CREATE INDEX "DocumentShare_roleId_idx" ON "DocumentShare"("roleId");

-- Add Foreign Keys
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
