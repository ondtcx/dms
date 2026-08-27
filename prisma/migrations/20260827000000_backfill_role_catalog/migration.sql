-- Idempotent additive compatibility backfill. Legacy enum/key fields are preserved.
DO $$
DECLARE
  unmapped TEXT;
BEGIN
  INSERT INTO "UserRoleAssignment" ("userId", "roleId")
  SELECT u."id", r."id"
  FROM "User" u
  JOIN "Role" r ON r."legacyRole" = u."role"
  ON CONFLICT ("userId", "roleId") DO NOTHING;

  UPDATE "DocumentPermission" dp
  SET "roleId" = r."id"
  FROM "Role" r
  WHERE dp."roleId" IS NULL
    AND dp."role" IS NOT NULL
    AND r."legacyRole" = dp."role";

  UPDATE "DocumentShare" ds
  SET "roleId" = r."id"
  FROM "Role" r
  WHERE ds."roleId" IS NULL
    AND ds."role" IS NOT NULL
    AND r."legacyRole" = ds."role";

  -- Legacy document permissions and shares remain unchanged; only missing catalog links are populated.
  SELECT string_agg(DISTINCT role_value, ', ' ORDER BY role_value)
  INTO unmapped
  FROM (
    SELECT u."role"::TEXT AS role_value
    FROM "User" u
    LEFT JOIN "Role" r ON r."legacyRole" = u."role"
    WHERE r."id" IS NULL
    UNION ALL
    SELECT dp."role"::TEXT
    FROM "DocumentPermission" dp
    LEFT JOIN "Role" r ON r."legacyRole" = dp."role"
    WHERE dp."role" IS NOT NULL AND r."id" IS NULL
    UNION ALL
    SELECT ds."role"::TEXT
    FROM "DocumentShare" ds
    LEFT JOIN "Role" r ON r."legacyRole" = ds."role"
    WHERE ds."role" IS NOT NULL AND r."id" IS NULL
  ) AS unmapped_values;

  IF unmapped IS NOT NULL THEN
    RAISE WARNING 'Unmapped legacy roles found in unmapped user/document/share role values; catalog authorization must remain disabled: %', unmapped;
  END IF;
END $$;
