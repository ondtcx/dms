-- Remove the departments persistence domain without rewriting migration history.
BEGIN;

-- Drop dependent foreign keys in dependency order.
ALTER TABLE "DocumentPermission" DROP CONSTRAINT "DocumentPermission_departmentId_fkey";
ALTER TABLE "DocumentShare" DROP CONSTRAINT "DocumentShare_departmentId_fkey";
ALTER TABLE "TransferHistory" DROP CONSTRAINT "TransferHistory_toDepartmentId_fkey";
ALTER TABLE "User" DROP CONSTRAINT "User_departmentId_fkey";
ALTER TABLE "Course" DROP CONSTRAINT "Course_departmentId_fkey";

-- Delete rows whose only target was a department before removing the columns.
DELETE FROM "DocumentPermission" WHERE "departmentId" IS NOT NULL;
DELETE FROM "DocumentShare" WHERE "departmentId" IS NOT NULL;
DELETE FROM "TransferHistory" WHERE "toDepartmentId" IS NOT NULL;

-- Remove department indexes and columns.
DROP INDEX "DocumentPermission_departmentId_idx";
DROP INDEX "DocumentShare_departmentId_idx";
DROP INDEX "User_departmentId_idx";
DROP INDEX "Course_departmentId_idx";

ALTER TABLE "DocumentPermission" DROP COLUMN "departmentId";
ALTER TABLE "DocumentShare" DROP COLUMN "departmentId";
ALTER TABLE "TransferHistory" DROP COLUMN "toDepartmentId";
ALTER TABLE "User" DROP COLUMN "departmentId";
ALTER TABLE "Course" DROP COLUMN "departmentId";

DROP TABLE "Department";

COMMIT;
