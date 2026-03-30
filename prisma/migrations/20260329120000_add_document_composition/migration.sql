-- AlterTable: add isComposite to Document
ALTER TABLE "Document" ADD COLUMN "isComposite" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: DocumentCompositionItem
CREATE TABLE "DocumentCompositionItem" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,
    "insertAfterPage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentCompositionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_isComposite_idx" ON "Document"("isComposite");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCompositionItem_parentId_childId_key" ON "DocumentCompositionItem"("parentId", "childId");

-- CreateIndex
CREATE INDEX "DocumentCompositionItem_parentId_idx" ON "DocumentCompositionItem"("parentId");

-- CreateIndex
CREATE INDEX "DocumentCompositionItem_childId_idx" ON "DocumentCompositionItem"("childId");

-- AddForeignKey
ALTER TABLE "DocumentCompositionItem" ADD CONSTRAINT "DocumentCompositionItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCompositionItem" ADD CONSTRAINT "DocumentCompositionItem_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
