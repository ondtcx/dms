/*
  Warnings:

  - Added the required column `updatedAt` to the `WorkflowApproval` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WorkflowApproval" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "action" DROP NOT NULL;
