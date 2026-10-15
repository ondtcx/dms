# Exploration: review-backend-implementations

## Scope
Review the existing backend implementations, with primary focus on the OnlyOffice integration, its file access and callback boundaries, document-version persistence, and focused regression coverage. This phase is planning-only; it makes no source, test, or configuration changes.

## Inputs
- **Committed baseline:** HEAD `bb73f3e`; NestJS/Prisma backend conventions and OpenSpec configuration in `openspec/project-context.md` and `openspec/config.yaml`.
- **Pending working-tree state:** `.gitignore` and `src/settings/settings.service.ts` are pre-existing changes and are outside this review; `.pi/` is also pre-existing runtime state. They must not be included or altered.
- **Observed verification:** build passed; Jest reported 174/176 passing, with the two failures in `onlyoffice.service.spec.ts`; focused OnlyOffice tests reproduce the Windows path assertion failures, while controller tests pass.
- **Relevant implementation evidence:** `src/onlyoffice/onlyoffice.service.ts`, `src/onlyoffice/onlyoffice.controller.ts`, their specs, `onlyoffice.module.ts`, document version logic in `src/document/document.service.ts`, and the Prisma `Document`/`DocumentVersion` model relationships.

## OnlyOffice Hypothesis and Observed Evidence
**Hypothesis:** the integration is functionally present but requires a bounded hardening review before it can be considered reliable: authentication, upstream response handling, version writes, and concurrent callbacks are the likely correctness and security boundaries.

Observed evidence:
- `OnlyofficeService.checkHealth()` validates the configured URL, calls `/healthcheck`, enforces status `200`, times out after three seconds, and hides upstream errors.
- Editor configuration creates a one-day HS256 JWT file token and exposes a callback URL; the public file endpoint verifies the token and document ID before streaming the latest version.
- The public callback handles OnlyOffice `status === 2`, downloads `body.url`, overwrites the current path, computes a checksum, increments `currentVersion`, creates a `DocumentVersion`, and records an UPDATE access event for the reported user.
- Controller tests pass for the reported-user audit event, but service tests fail on Windows-specific slash assumptions rather than demonstrating a business-logic failure.
- The callback currently has no visible callback-payload JWT authenticity verification, does not validate fetch success or required response fields, and performs document update/version creation without an apparent transaction or idempotency guard.
- Version records may share the overwritten physical path, and callback handling assumes an existing latest version; empty-version and missing-secret behavior therefore require explicit review against immutable-history expectations.

## Non-goals
- No implementation, test, migration, dependency, configuration, or working-tree cleanup.
- No redesign of the complete document/version subsystem or OnlyOffice deployment.
- No assumption that the two Windows path assertion failures alone justify production-code changes.
- No proposal-stage commitment to a specific schema, callback protocol, or delivery chain.

## Risks
- Unauthenticated or weakly authenticated callbacks could cause unauthorized file replacement or audit attribution.
- Fetching an unsuccessful, malformed, or empty upstream response could persist invalid content.
- Retries and concurrent status-2 callbacks could create duplicate versions, race `currentVersion`, or corrupt the shared current path.
- In-place overwrite conflicts with immutable version history and can make older versions point at changed bytes.
- Missing `ONLYOFFICE_SECRET`, missing versions, invalid document IDs, and invalid user identifiers may produce unsafe exceptions or misleading success responses.
- Fixing tests with platform-specific expectations could conceal portability problems or create unrelated review scope.

## Open Decisions Before Proposal
1. What callback authenticity contract will be supported: OnlyOffice JWT payload/header verification, a separate shared signature, or an explicitly documented trusted-network boundary?
2. Should callbacks persist immutable per-version files, and how should existing shared-path records be migrated or treated?
3. What idempotency key and transaction/locking strategy should govern retries and concurrent callbacks?
4. Which response statuses, content types, size limits, and empty payloads are acceptable from `body.url`?
5. What is the intended behavior for missing secrets, missing current versions, unknown users, and malformed callback bodies?
6. Should the review correct only the Windows test expectations, or also add cross-platform tests for the identified security and versioning contracts?

## Readiness
Ready for proposal after these decisions are answered. The proposal should remain bounded, preserve unrelated pending state, and forecast review size against the 400-line budget.
