-- Backfill the academic year for documents that do not have one, using the
-- origin date when present and the creation date otherwise.
INSERT INTO "DocumentAcademic" ("documentId", "academicYearId")
SELECT document."id", year."id"
FROM "Document" AS document
JOIN "AcademicYear" AS year
  ON COALESCE(document."originDate", document."createdAt"::date)
     BETWEEN year."startDate"::date AND year."endDate"::date
WHERE document."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "DocumentAcademic" AS existing
    WHERE existing."documentId" = document."id"
  );
