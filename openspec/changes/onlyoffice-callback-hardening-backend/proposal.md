# Proposal: Harden the OnlyOffice Backend Callback

## Intent

Remediate the failed OnlyOffice backend verification in one security- and integrity-focused slice. The change will harden callback and file-token boundaries, constrain callback downloads to a bounded same-origin upstream, make duplicate and filesystem cleanup reference-safe, and add the smallest high-value regression suite that proves these contracts.

This proposal is planning-only. It does not edit application source, tests, schema, migrations, configuration, or unrelated working-tree files, and it does not run tests.

## Evidence and current gap

Exploration identified seven blockers in the prior verification report:

- `openspec/changes/review-backend-implementations-backend/verify-report.md`
- Evidence revision: `sha256:2f8108f4ee37e68aa5a18fbb998fa4298eaa82e23317e8e10087679d0ec893e6`

The prior verification commands passed, but the implementation still had these contract failures:

1. Header-only Bearer extraction used literal escaped whitespace rather than strict whitespace parsing.
2. The file route bypassed the hardened verifier, lacked an explicit HS256 allow-list, could dereference a missing latest version, and could trim a missing secret unsafely.
3. Upstream handling rejected bounded same-origin redirect following, materialized the whole response before enforcing the limit, and accepted explicit incompatible content types.
4. Staging and duplicate failure paths could leave candidates or delete a path without first proving it was unreferenced.
5. The focused suite did not cover the required JWT, upstream, immutable-history, duplicate, rollback, cleanup, and audit matrix.
6. The approved surface was 406 changed lines, six over the canonical 400-line limit.
7. Strict-TDD evidence lacked task-level RED/GREEN/TRIANGULATE/SAFETY-NET records.

Passing tests and build output must remain supplementary evidence; the next implementation must prove the documented boundaries and stay below the review gate.

## Fixed product decisions and invariants

The following decisions are already confirmed and are not reopened by this proposal:

- OnlyOffice callbacks require signed JWT authentication with `ONLYOFFICE_SECRET`; there is no trusted-network or unsigned fallback.
- Each callback-created version has immutable, distinct physical storage. Existing version paths, bytes, checksums, and metadata are never overwritten.
- Callback receipt uniqueness and version persistence remain durable database behavior, using a persistent receipt and a transaction with per-document coordination.
- The public callback continues to return HTTP 200 with only `{ error: 0 }` or `{ error: 1 }`. Authentication, validation, upstream, and persistence failures expose no token, secret, URL, upstream, or database details.
- Existing health, file-token, status handling, and document APIs remain compatible except where fail-closed security handling is required.

## Scope

### 1. Harden Bearer JWT and file-token safety

- Extract `Authorization: Bearer <token>` using actual whitespace rules and reject empty, malformed, or ambiguous headers. Support the documented callback body-token transport only as a signed token; when both transports exist, require identical token values.
- Require a present, non-blank secret before verification and call JWT verification with an explicit `HS256` allow-list and normal expiry validation. Do not log or return token, secret, or verifier details.
- Trust callback claims only after verification. Bind the verified document identity/key to the route document ID and reject body/claim disagreement. Do not use unsigned body fields as an authorization fallback.
- Route file-token verification through the same safe verifier, enforce the route document identity, and fail closed for missing configuration, wrong algorithm, malformed/expired tokens, and mismatched claims.
- Handle a document with no latest version as a safe failure rather than an array-access exception. Preserve the existing file route purpose and response/API shape.

### 2. Validate the callback upstream within a bounded same-origin boundary

- Require a valid absolute HTTP(S) callback URL with no credentials or fragment. Compare its origin with the configured `ONLYOFFICE_URL` origin, including protocol, host, and effective port.
- Follow only a small bounded number of redirects (the existing design target is three), rechecking same-origin and credential/fragment rules at every hop. Reject foreign redirects and redirect loops.
- Apply a bounded timeout (the existing design target is ten seconds), require a 2xx response, and enforce the maximum response size while streaming as well as from a valid `Content-Length`.
- Reject explicit incompatible content types. Allow valid empty text content where the current document format permits it, but reject empty binary/office content.
- Convert all upstream failures to the safe callback failure response without returning response bodies or network error details.

### 3. Preserve immutable versions and make duplicate/orphan cleanup safe

- Stage each candidate through the existing storage helpers at unique temporary and final paths. Never overwrite a path referenced by any retained `DocumentVersion`.
- Keep the persistent receipt, receipt uniqueness constraint, document coordination, version creation, current-version/checksum update, and valid audit event in one transaction. An authenticated duplicate is an idempotent success and must not create a version or audit event.
- On validation, filesystem, duplicate, or transaction failure, remove temporary candidates and remove final candidates only after a database reference check proves they are unreferenced. If reference status cannot be proven, leave the candidate for safe operational cleanup rather than risking immutable history.
- Ensure transaction rollback cannot leave a current-version advance, receipt/version/audit partial write, or an orphan that can safely be removed but is retained because cleanup was skipped.
- Preserve all existing version paths, bytes, metadata, and checksums; do not backfill or rewrite historical shared-path rows.

### 4. Add only the highest-value regressions

Keep tests in the existing OnlyOffice service and controller specs. Prefer parameterized cases and shared fixtures so the total implementation-plus-test diff remains below 400 changed lines. Cover:

- Header-only, body-only, matching dual-token, and mismatched dual-token callback transport.
- Missing/blank secret, malformed, expired, wrong-algorithm, route-mismatched, and claim-mismatched JWTs, plus file-token route verification and missing latest-version handling.
- Safe `{ error: 0 | 1 }` responses with no mutation or sensitive diagnostics for rejected callbacks.
- Foreign/credentialed/fragment URLs, foreign redirects, redirect bounds, timeout/network failure, non-2xx responses, incompatible content type, streamed oversize responses, empty binary rejection, and valid empty text acceptance.
- Unique immutable paths, unchanged historical bytes/metadata, synchronized current version/checksum, duplicate receipt cleanup, transaction rollback cleanup, and no deletion of referenced files.
- Valid audit-user attribution and invalid/unknown-user rejection without fallback attribution. Retain existing health, status, file-token, and controller coverage.
- Normalize paths and use separator-aware relationship assertions; do not replace production path behavior with broad wildcard assertions.

Implementation must record task-level RED, GREEN, TRIANGULATE, and SAFETY-NET evidence so the previous strict-TDD blocker is not repeated. This proposal phase records no test execution.

## Affected areas and allowed surface

| Area | Planned change |
|---|---|
| `src/onlyoffice/onlyoffice.controller.ts` | Pass callback authorization/body data safely, preserve HTTP 200 callback responses, and handle absent latest versions without unsafe dereference. |
| `src/onlyoffice/onlyoffice.service.ts` | Own JWT/file-token verification, claim validation, bounded same-origin download, immutable staging, reference-safe cleanup, receipt handling, and transactional persistence. |
| `src/onlyoffice/onlyoffice.service.spec.ts` | Add the focused security, upstream, immutable-storage, duplicate, rollback, cleanup, identity, and path regressions. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Cover transport selection, safe callback responses, and controller boundary failures while retaining existing behavior checks. |
| `prisma/schema.prisma` and one reconciled receipt migration | Preserve the existing durable callback-receipt design with only the smallest schema/migration surface required for uniqueness. |

No new dependency, storage abstraction, broad document-service change, or deployment change is planned. Generated client output is implementation tooling only unless already tracked by repository policy.

## Explicit exclusions

The following exclusions from exploration remain binding:

- OnlyOffice deployment, networking, callback-hosting, secret-distribution, or topology redesign.
- Broad historical migration, rewriting, or cleanup of shared-path versions.
- Changes to `DocumentService.saveTextContent` behavior.
- New storage abstractions or dependencies.
- Broad API, permissions, workflow, audit-model, or document/version-subsystem redesign.
- Lower-priority real-PostgreSQL concurrency test infrastructure or a new integration fixture framework.
- Any unrelated pending change, commit, or cleanup outside this slice.

In particular, do not edit the pending `.gitignore` or `src/settings/settings.service.ts` changes, and do not include `.pi/`, `.codegraph/`, or other runtime/session state. Existing unrelated working-tree changes must remain untouched.

## Review-budget guard

The implementation and focused regression diff has a hard maximum of 399 changed lines; the proposal forecast is intentionally below that boundary:

| Work area | Forecast |
|---|---:|
| Controller implementation | 25–35 |
| Service implementation | 105–125 |
| Schema and receipt migration | 20–30 |
| Controller regressions | 35–45 |
| Service regressions | 115–145 |
| **Total** | **300–380** |

The forecast includes additions and deletions and includes the receipt migration. Optional cases must be deferred if the forecast approaches the upper bound. At 400 changed lines or more, work pauses under `ask-on-risk`; no chain strategy and no `size:exception` may be inferred.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Deployed OnlyOffice transport differs from the documented JWT forms. | Support only the documented header/body forms, require equality when both are present, and fail closed rather than accept unsigned claims. |
| Stricter origin, redirect, MIME, or empty-content rules reject a legitimate response. | Preserve positive same-origin text/binary fixtures, apply the checks consistently at every redirect, and keep the limits explicit and bounded. |
| Filesystem operations cannot roll back with the database. | Stage uniquely, commit only paths that exist, reference-check before final deletion, and retain uncertain candidates for safe operational cleanup. |
| Duplicate callbacks race with candidate staging or receipt insertion. | Use the persistent unique receipt, treat authenticated uniqueness conflicts as no-op success, and clean only proven-unreferenced candidates. |
| Existing shared-path history makes cleanup unsafe. | Never perform broad historical cleanup and never delete a path while any retained version references it. |
| Security and regression coverage exceed the review budget. | Use existing specs, parameterized cases, and a 380-line forecast; pause at the configured 400-line gate instead of silently widening scope. |

## Rollback and recovery

- Revert only the callback hardening code if runtime compatibility requires recovery. Do not delete immutable files or rewrite historical version paths during rollback.
- Leave the receipt table and committed receipt rows in place when safe; do not down-migrate after receipts exist without confirming that no receipt depends on the schema.
- Preserve already committed versions and audit history. Any cleanup procedure must check references and must not use path-pattern deletion.
- If an orphan cannot be proven unreferenced, leave it for bounded operational cleanup. Do not mix that operation with unrelated working-tree cleanup or deployment changes.

## Success criteria

1. Valid OnlyOffice callbacks and file tokens require the configured secret, explicit HS256 verification, valid expiry/claims, and route-bound document identity.
2. Missing, malformed, expired, wrong-algorithm, mismatched, or unsigned authentication fails before mutation and returns no sensitive details.
3. Status-2 downloads remain within the configured same-origin boundary, bounded redirects, timeout, 2xx, size, content-type, and empty-content rules.
4. Failed or duplicate callbacks clean candidates safely, never delete referenced files, and never alter immutable historical versions.
5. A valid callback creates one distinct immutable version and synchronizes the document current version/checksum and validated audit user; a duplicate creates neither a second version nor a second audit event.
6. The focused suite observes the highest-value security, upstream, cleanup, immutable-history, identity, and safe-response contracts while preserving existing OnlyOffice behavior and separator-independent path assertions.
7. The implementation diff, including schema and migration changes, remains below 400 changed lines. If it reaches the gate, work pauses for the configured ask-on-risk decision.

## Next phase and delivery context

The next phase may translate this proposal into a minimal specification/design and implementation tasks. It must retain the fixed JWT, immutable-version, and persistent-receipt decisions, preserve unrelated pending changes, and capture per-task strict-TDD evidence. No tests, source files, migrations, commits, chain strategy, or size exception are authorized by this proposal phase.

Delivery remains `ask-on-risk` with a canonical 400 changed-line threshold. This bounded proposal does not select chaining or authorize a `size:exception`.
