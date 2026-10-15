# Tasks: Harden OnlyOffice Backend Integration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 365–400 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; pause and ask if the concrete diff exceeds 400 lines |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

## Allowed Edit Surfaces

Implementation may modify only `src/onlyoffice/onlyoffice.controller.ts`, `src/onlyoffice/onlyoffice.service.ts`, `src/onlyoffice/onlyoffice.service.spec.ts`, `src/onlyoffice/onlyoffice.controller.spec.ts`, and `prisma/schema.prisma`; it may add one reconciled-timestamp migration under `prisma/migrations/*_add_onlyoffice_callback_receipts/migration.sql`. Do not edit `src/storage/storage.service.ts`, `src/document/document.service.ts`, `src/onlyoffice/onlyoffice.module.ts`, `package.json`, lockfiles, `.gitignore`, `src/settings/settings.service.ts`, `.pi/`, or unrelated pending changes.

## Ordered Implementation Work Units

### 1. RED — Establish focused failing regressions

- [x] Add focused failing tests in `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts` for HS256 JWT transport/claims, safe status handling, malformed identities, same-origin bounded upstream responses, immutable paths, receipt idempotency, transaction failure/cleanup, audit attribution, and Windows-safe path assertions; retain existing health, file-token, status-2, and controller audit coverage. <!-- sdd-owner: implementation -->

**Dependencies:** None. **Finish:** each fixed-scope acceptance boundary has an observable failing assertion and no production files are changed. **Rollback:** remove only the newly added test cases.

### 2. GREEN — Add schema, migration, and generated client

- [x] Add `OnlyofficeCallbackReceipt` and the `Document.onlyofficeCallbackReceipts` relation in `prisma/schema.prisma`, then add one migration under `prisma/migrations/*_add_onlyoffice_callback_receipts/migration.sql` creating the table, unique `idempotencyKey`, foreign key, and document index; reconcile the migration timestamp with existing repository migrations and run Prisma client generation as implementation tooling without committing generated artifacts unless the repository tracks them. <!-- sdd-owner: implementation -->

**Dependencies:** Unit 1 defines receipt expectations. **Finish:** schema and migration support durable uniqueness and cascade behavior. **Rollback:** revert only the schema/migration; before any down migration, confirm no receipt rows exist.

### 3. GREEN — Harden service boundaries and persistence

- [x] Implement the service changes in `src/onlyoffice/onlyoffice.service.ts`: extract matching Bearer/body JWT transport, fail closed on `ONLYOFFICE_SECRET`, verify HS256 and expiry, normalize verified claims, cross-check route/key/document identity, preserve authenticated non-2 acknowledgements, validate status-2 payloads and users, validate same-origin HTTP(S) URLs, enforce manual same-origin redirects, timeout, 2xx/content-type/50 MiB/content usability limits, stage unique temp/final files with existing storage helpers, clean only unreferenced candidates, and persist receipt/version/document checksum/current version/audit atomically with an interactive Prisma transaction and PostgreSQL row lock. Harden file-token verification and missing latest-version handling in the same service boundary. <!-- sdd-owner: implementation -->

**Dependencies:** Unit 2 schema/client; existing `PrismaService` and `StorageService` APIs. **Finish:** valid callbacks return the existing `{ error: 0 | 1 }` shape, invalid or failed callbacks have no mutation and no sensitive diagnostics, duplicates are no-ops, and distinct callbacks serialize. **Rollback:** revert the service path only; retain committed immutable files and receipt rows, and never restore in-place overwrites.

### 4. GREEN — Preserve the controller contract

- [x] Update `src/onlyoffice/onlyoffice.controller.ts` to pass authorization/body data to the service, use the hardened file-token path, safely handle absent latest versions, and return HTTP 200 with only `{ error: 0 }` or `{ error: 1 }` for callback outcomes. <!-- sdd-owner: implementation -->

**Dependencies:** Unit 3 service API. **Finish:** OnlyOffice callback and file routes remain compatible while authentication and failure handling are fail-closed. **Rollback:** revert controller changes without touching unrelated routes.

### 5. TRIANGULATE — Verify focused behavior and budget

- [x] Run the focused OnlyOffice specs, full unit suite, build, and lint; inspect the diff limited to the allowed surfaces, count additions plus deletions, and verify migration/client-generation status. If the concrete diff exceeds 400 changed lines, stop and request the configured ask-on-risk delivery decision without selecting a chain strategy or `size:exception`. <!-- sdd-owner: implementation -->

**Dependencies:** Units 2–4. **Finish:** required tests pass, build succeeds, and the diff is at or below 400 changed lines, or work is paused at the gate. **Rollback:** revert only the failing work unit after preserving diagnostic evidence; do not clean unrelated files.

### 6. REFACTOR — Keep the hardening slice reviewable

- [x] Refactor only within the allowed implementation and test files to remove duplication, preserve Spanish user-facing messages/comments and English identifiers, keep path assertions platform-independent, and rerun the focused verification plus 400-line count. <!-- sdd-owner: implementation -->

**Dependencies:** Unit 5 passes and remains within budget. **Finish:** behavior and coverage remain unchanged with a concise reviewable diff. **Rollback:** revert the refactor independently, retaining the verified GREEN implementation.

## Migration and Rollout Notes

Apply the receipt migration before deploying the callback code, then generate Prisma Client before build/test verification. Existing versions and files require no backfill. A source rollback may leave the receipt table in place; do not routinely down-migrate after receipts exist. Remove staged files only after confirming no retained `DocumentVersion.path` references them; leave uncertain orphans for bounded operational cleanup.
