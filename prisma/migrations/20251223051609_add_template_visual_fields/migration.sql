/*
  Warnings:

  - Added the required column `htmlTemplate` to the `DocumentTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: Add htmlTemplate with a temporary default value
ALTER TABLE "DocumentTemplate" ADD COLUMN "htmlTemplate" TEXT NOT NULL DEFAULT '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{name}}</title>
</head>
<body>
  <h1>{{type}}</h1>
  <div>{{#each fields}}
    <p><strong>{{this.label}}:</strong> {{this.value}}</p>
  {{/each}}</div>
</body>
</html>';

-- Add other columns
ALTER TABLE "DocumentTemplate" ADD COLUMN "orientation" TEXT NOT NULL DEFAULT 'portrait';
ALTER TABLE "DocumentTemplate" ADD COLUMN "outputFormat" TEXT NOT NULL DEFAULT 'pdf';
ALTER TABLE "DocumentTemplate" ADD COLUMN "pageSize" TEXT NOT NULL DEFAULT 'A4';
ALTER TABLE "DocumentTemplate" ADD COLUMN "styles" TEXT;

-- Remove the temporary default (future inserts must provide htmlTemplate)
ALTER TABLE "DocumentTemplate" ALTER COLUMN "htmlTemplate" DROP DEFAULT;
