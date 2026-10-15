# Proposal: Harden the OnlyOffice Backend Integration

## Intent

Make the existing backend OnlyOffice integration safe to rely on for document editing and version history. The change will harden the callback and file boundaries, preserve immutable version content, prevent retries and concurrent callbacks from creating inconsistent state, and add focused regression coverage without redesigning the wider document subsystem or the OnlyOffice deployment.

## Problem statement

The committed backend at HEAD `bb73f3e` already exposes the health, file-token, editor configuration, and callback flows. The current callback can, however, accept an unverified payload, persist an unsuccessful or malformed upstream response, overwrite the physical path referenced by earlier versions, and increment/create versions without transaction or idempotency protection. Missing configuration, missing versions, invalid document identifiers, and invalid audit users can also produce unsafe failures or misleading success responses.

The existing verification evidence is:

- The backend build passes.
- Jest reports 174/176 passing tests; the two failures are Windows path assertions in `onlyoffice.service.spec.ts`.
- Existing controller tests pass, including the reported-user UPDATE audit event.
- Health, file-token, and status-2 callback flows already exist.

The change is worth doing now because an unauthenticated or non-idempotent callback can replace document content and corrupt the meaning of version history while appearing to succeed.

## Confirmed product decisions

- Authenticate OnlyOffice callbacks with a signed OnlyOffice JWT using `ONLYOFFICE_SECRET`; do not rely on a trusted-network assumption or an unauthenticated fallback.
- Store a distinct immutable physical file for every persisted version. A callback must never overwrite a path referenced by an existing version.
- Protect retries and concurrent callbacks with a persistent idempotency mechanism and a database transaction/locking strategy.
- Include both Windows path portability fixes and integration hardening regression tests.
- Preserve the existing callback and file-access purpose and API shape unless a compatibility-preserving error response is required for safe failure.

## Scope

### 1. Authenticate and validate the callback boundary

- Verify the OnlyOffice callback JWT with the configured secret and an explicit permitted algorithm before trusting any callback fields.
- Fail closed when the secret is missing, blank, malformed, expired, or otherwise invalid. Do not log tokens or return secret/configuration details.
- Cross-check the authenticated callback identity with the route document ID and the callback payload/document key when the claim is available. Reject mismatches before reading or mutating document state.
- Validate the callback body as an object with a supported status. For status `2`, require a valid document identity and download URL; do not fetch or mutate state for malformed payloads.
- Keep non-status-2 callbacks as no-op acknowledgements according to the OnlyOffice callback contract, while ensuring they cannot trigger a version write.
- Handle missing documents, missing current versions, invalid IDs, and invalid user identifiers without array-access errors, false success, or information leakage.

### 2. Validate the OnlyOffice upstream response

- Parse and validate `body.url` before fetching it. Restrict the request to the supported HTTP(S) contract and the configured/trusted OnlyOffice upstream boundary; do not turn the callback into an arbitrary server-side fetch primitive.
- Apply a bounded request timeout and handle network failures, redirects, non-success status codes, unusable content, and response-size limits without persisting the response.
- Preserve valid empty text documents where the existing document type permits them, but reject an empty or otherwise unusable binary/office payload.
- Keep upstream failure details out of the public callback response. Return the documented failure signal so OnlyOffice can retry transient work, and log only safe diagnostic context.
- Do not add deployment redesign, malware scanning, or a general document parser as part of this change.

### 3. Persist immutable versions

- Stage the downloaded content in a unique temporary/final storage location using the existing storage abstractions and platform-safe path construction.
- Create each new `DocumentVersion` with its own `storedName` and `path`; retain every prior version's bytes, path, checksum, and metadata unchanged.
- Update `Document.currentVersion` and the document-level checksum consistently with the new latest version.
- Keep the existing latest-version file route working by selecting the newest version, without changing unrelated document download/version APIs.
- Clean up staged/orphaned files on validation, transaction, or persistence failure as far as the filesystem boundary allows; never delete a path still referenced by a retained version.

### 4. Make retries and concurrency safe

- Derive a stable idempotency key from the authenticated callback identity and canonical callback data, using the smallest persistent schema addition necessary if the current schema has no suitable receipt/marker.
- Enforce uniqueness for the idempotency record/marker at the database boundary rather than relying on process memory.
- Perform the document row coordination, version-number allocation, version creation, document checksum/current-version update, and valid user audit event in one Prisma transaction with a row-lock or equivalent optimistic-concurrency guard.
- Treat an authenticated duplicate callback as an idempotent no-op after the original write has committed. Do not create another version or audit event.
- Ensure distinct concurrent callbacks receive distinct sequential versions, and ensure a failed transaction cannot leave `currentVersion` advanced without its matching version record.
- Do not attribute an update to the document owner or another fallback user. A supplied user must resolve to a valid user before it is recorded; malformed or unknown attribution must fail safely without inventing an audit identity.

### 5. Fix portability and add regression coverage

- Replace Windows-specific slash assumptions in `src/onlyoffice/onlyoffice.service.spec.ts` with path-separator-aware assertions based on the repository's path helpers.
- Add focused service/controller or integration-style coverage for:
  - valid, missing, expired, malformed, and mismatched callback JWTs;
  - missing OnlyOffice secret and missing current-version handling;
  - malformed status-2 payloads and invalid document identities;
  - upstream non-success responses, timeout/fetch failure, unusable content, and safe error responses;
  - unique per-version paths, unchanged historical bytes/metadata, and synchronized document checksum/current version;
  - duplicate callbacks, concurrent callbacks, transaction failure, and cleanup behavior;
  - known-user audit attribution and invalid-user handling;
  - existing health, file-token, status-2, and controller audit behavior.
- Keep assertions platform-independent and avoid changing tests merely to hide production path problems.

## Affected areas

| Area | Planned impact |
| --- | --- |
| `src/onlyoffice/onlyoffice.controller.ts` | Authenticate and validate the public callback/file boundaries, preserve the callback response contract, and delegate persistence to a transaction-safe path. |
| `src/onlyoffice/onlyoffice.service.ts` | Own reusable JWT/configuration validation, upstream download validation, immutable storage coordination, and callback persistence behavior where appropriate. |
| `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts` | Correct Windows path assertions and add the focused security, integrity, retry, concurrency, and failure regressions. |
| `src/storage/storage.service.ts` | Reuse or minimally extend existing unique, cross-platform path helpers only if the callback cannot satisfy immutable storage through current abstractions. |
| `prisma/schema.prisma` and one focused migration, if required | Add only the smallest durable idempotency receipt/marker needed to enforce duplicate protection across processes. No document/version subsystem redesign. |
| `src/document/document.service.ts` | Compatibility review only where shared version/path assumptions are affected; unrelated document editing behavior remains out of scope. |

No changes are proposed for deployment topology, OnlyOffice installation/configuration redesign, frontend behavior, or unrelated backend modules.

## Explicit non-goals and exclusions

- No source, test, migration, dependency, environment, or deployment changes are made by this proposal phase.
- No redesign of the complete document/version subsystem, workflow rules, permissions model, or audit model.
- No migration or cleanup of unrelated historical data beyond the compatibility treatment required for callback-created versions.
- No redesign of OnlyOffice deployment, networking, callback hosting, or secret distribution.
- No changes to the pre-existing pending `.gitignore` or `src/settings/settings.service.ts` work.
- Do not include or alter the pre-existing untracked `.pi/` runtime state.
- Do not include any unrelated pending working-tree changes in implementation or review scope.
- No assumption that the two Windows assertion failures alone justify production behavior changes.

## Compatibility and data treatment

Existing shared-path version rows are not rewritten broadly in this bounded change. New OnlyOffice callback versions must use immutable paths. Existing rows remain readable under current storage behavior, and any compatibility handling must avoid deleting a physical path while another retained version still references it. A separate historical-data migration or full version-storage redesign is outside this proposal.

The public callback remains usable by OnlyOffice and continues to return its documented success/failure shape. Authentication and validation failures must occur before document mutation; duplicate authenticated callbacks should be acknowledged as already applied. Existing health and file-token behavior should remain compatible except that missing configuration must fail closed rather than throw an unsafe configuration error.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| OnlyOffice sends the JWT in a transport variant not covered by the implementation. | Confirm the deployed OnlyOffice callback JWT transport during design, support the documented transport only, and test valid/invalid requests at the controller boundary. |
| A callback JWT authenticates OnlyOffice but does not uniquely identify one save event. | Use a canonical persistent callback receipt/marker and a database uniqueness constraint; treat exact retries as no-ops. |
| Filesystem operations cannot roll back with a database transaction. | Stage to unique paths, commit only metadata that points to those paths, and perform best-effort cleanup of unreferenced staged files on failure. Never overwrite or delete retained version paths. |
| Locking/idempotency changes exceed the review budget. | Target a focused implementation and test slice within 400 changed lines; if the forecast exceeds 400, pause under ask-on-risk before implementation and request a delivery decision rather than inventing chaining or an exception. |
| Existing historical shared paths make cleanup unsafe. | Do not perform broad historical cleanup; check referenced paths before any deletion and keep compatibility behavior explicit. |
| Stricter upstream validation rejects a valid OnlyOffice response. | Base acceptance on the documented callback contract, preserve valid empty text behavior, and add positive integration fixtures alongside negative cases. |
| Invalid reported users prevent audit attribution or cause foreign-key failures. | Validate supplied users before creating an audit record, never fall back to another user, and define the safe no-attribution/rejection behavior in the implementation contract. |

## Rollback and recovery

- If the hardened callback introduces a runtime regression, disable or revert only the callback hardening path while preserving already committed immutable version rows and files. Do not delete files by path pattern.
- Treat any idempotency schema addition as forward-compatible data. A down migration is allowed only after confirming that no committed callback receipts depend on it; otherwise deploy a forward fix rather than deleting receipt history.
- A reverted callback must not reintroduce in-place overwrites. Existing immutable files remain valid, and restoring an earlier document state must use the existing explicit version-restore behavior rather than deleting newer history.
- Reconcile unreferenced staged files through a bounded cleanup procedure; do not mix that cleanup with unrelated working-tree cleanup or deployment changes.

## Success criteria

1. Only callbacks with a valid OnlyOffice JWT and matching document identity can cause a status-2 write; missing or invalid secrets fail closed.
2. Invalid callback payloads and unsuccessful, timed-out, empty/unusable, or oversized upstream responses leave the document, version history, audit records, and current file unchanged.
3. A valid status-2 callback creates one new version with a unique physical path, preserves all prior version bytes/metadata, and synchronizes `currentVersion` and checksums.
4. Retried or concurrent delivery of the same callback creates no duplicate version or audit event, while distinct callbacks remain sequential and transactionally consistent.
5. Error responses expose no secrets or upstream internals, and malformed/missing documents or users cannot cause unsafe exceptions or false audit attribution.
6. Windows path assertions are separator-independent, and the focused regression suite covers the security, upstream, immutable-storage, idempotency, concurrency, and failure contracts without weakening existing health/file-token/controller coverage.
7. Implementation and review remain within the 400 changed-line budget; any forecasted overrun pauses for the configured ask-on-risk delivery decision.

## Review and delivery context

This proposal is based on exploration of committed HEAD `bb73f3e`, the current OnlyOffice controller/service/specs, the document/version persistence model, and the observed build/Jest evidence above. The pending `.gitignore` and `src/settings/settings.service.ts` changes, together with `.pi/` runtime state, are review context only and must remain outside implementation scope.

The delivery strategy is `ask-on-risk` with a 400 changed-line review budget. This proposal phase does not run tests, change source files, alter configuration, or select a PR chain. The next phase should turn these boundaries into acceptance criteria and a minimal design before implementation.
