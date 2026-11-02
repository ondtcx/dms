-- Baja lógica de usuarios: conserva la fila y el historial, bloquea el acceso.
ALTER TABLE "User"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN "deactivatedById" TEXT,
  ADD COLUMN "deactivationReason" TEXT;

CREATE INDEX "User_isActive_idx" ON "User"("isActive");
CREATE INDEX "User_deactivatedById_idx" ON "User"("deactivatedById");

ALTER TABLE "User"
  ADD CONSTRAINT "User_deactivatedById_fkey"
  FOREIGN KEY ("deactivatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
