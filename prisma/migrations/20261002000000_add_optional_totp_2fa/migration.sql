-- Add optional per-user TOTP MFA state. Secrets and recovery hashes are never selected by user projections.
ALTER TABLE "User"
  ADD COLUMN "totpSecret" TEXT,
  ADD COLUMN "totpPendingSecret" TEXT,
  ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "totpRecoveryCodeHashes" JSONB NOT NULL DEFAULT '[]';
