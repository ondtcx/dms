/*
  Warnings:

  - You are about to drop the column `allowedRoles` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `allowedInitiatorRoles` on the `WorkflowTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `stateDefinitions` on the `WorkflowTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" DROP COLUMN "allowedRoles";

-- AlterTable
ALTER TABLE "WorkflowTemplate" DROP COLUMN "allowedInitiatorRoles",
DROP COLUMN "stateDefinitions";
