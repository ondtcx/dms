INSERT INTO "Permission" ("key", "label", "updatedAt") VALUES
  ('authoring.templates.design', 'Diseñar plantillas de elaboración documental', CURRENT_TIMESTAMP),
  ('authoring.templates.publish', 'Publicar versiones de plantillas de elaboración', CURRENT_TIMESTAMP),
  ('authoring.templates.manage', 'Crear, duplicar y desactivar plantillas de elaboración', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."key" = 'admin'
  AND p."key" IN (
    'authoring.templates.design',
    'authoring.templates.publish',
    'authoring.templates.manage'
  )
ON CONFLICT DO NOTHING;
