ALTER TABLE "DocumentTemplateVersion"
  ADD COLUMN "publishedById" TEXT,
  ADD COLUMN "publishedByName" TEXT;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" = 'authoring.templates.design'
WHERE r."key" = 'secretario'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."key" = 'authoring.templates.publish'
WHERE r."key" = 'rector'
ON CONFLICT DO NOTHING;
