-- CreateExtension for trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable Document - Add full-text search fields
ALTER TABLE "Document" ADD COLUMN "searchVector" tsvector;
ALTER TABLE "Document" ADD COLUMN "extractedText" TEXT;

-- CreateIndex for full-text search (GIN index)
CREATE INDEX "Document_searchVector_idx" ON "Document" USING GIN ("searchVector");

-- CreateFunction to update searchVector automatically
CREATE OR REPLACE FUNCTION document_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('spanish', COALESCE(NEW.filename, '')), 'A') ||
    setweight(to_tsvector('spanish', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('spanish', COALESCE(NEW."extractedText", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CreateTrigger to automatically update searchVector
CREATE TRIGGER document_search_vector_trigger
BEFORE INSERT OR UPDATE OF filename, description, "extractedText"
ON "Document"
FOR EACH ROW
EXECUTE FUNCTION document_search_vector_update();

-- Update existing documents to populate searchVector
UPDATE "Document" SET "searchVector" =
  setweight(to_tsvector('spanish', COALESCE(filename, '')), 'A') ||
  setweight(to_tsvector('spanish', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('spanish', COALESCE("extractedText", '')), 'C');

-- CreateTable SearchHistory
CREATE TABLE "SearchHistory" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for SearchHistory
CREATE INDEX "SearchHistory_userId_idx" ON "SearchHistory"("userId");
CREATE INDEX "SearchHistory_createdAt_idx" ON "SearchHistory"("createdAt");

-- AddForeignKey for SearchHistory
ALTER TABLE "SearchHistory" ADD CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
