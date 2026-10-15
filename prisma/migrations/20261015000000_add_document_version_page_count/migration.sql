-- Metadatos de lectura de cada versión. Queda nulo mientras el recuento no se
-- haya podido medir: nunca se escribe un número inventado.
ALTER TABLE "DocumentVersion"
ADD COLUMN "pageCount" INTEGER;
