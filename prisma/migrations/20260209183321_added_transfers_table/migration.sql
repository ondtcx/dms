/*
  Warnings:

  - You are about to drop the column `deletedDocuments` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `documentAccesses` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `documentVersions` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `DocumentTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "deletedDocuments",
DROP COLUMN "documentAccesses",
DROP COLUMN "documentVersions";

-- CreateTable
CREATE TABLE "TransferHistory" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "toDepartmentId" INTEGER,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "comment" TEXT,

    CONSTRAINT "TransferHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_name_key" ON "DocumentTemplate"("name");

-- AddForeignKey
ALTER TABLE "TransferHistory" ADD CONSTRAINT "TransferHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferHistory" ADD CONSTRAINT "TransferHistory_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferHistory" ADD CONSTRAINT "TransferHistory_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferHistory" ADD CONSTRAINT "TransferHistory_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
