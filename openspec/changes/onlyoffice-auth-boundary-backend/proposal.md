# Proposal: Establish the OnlyOffice Authentication Boundary Backend

## Intent

Remediate the authentication-specific blockers from the prior failed OnlyOffice verification in the first of two stacked changes targeting `main`. This slice will make callback and file-token authentication fail closed while preserving the existing public callback response contract and limiting regression coverage to the highest-value authentication cases.

This is a planning-only artifact. It does not edit application source, tests, migrations, configuration, or unrelated working-tree files, and it does not run tests.

## Evidence and current gap

This proposal is based on:

- `openspec/changes/onlyoffice-auth-boundary-backend/explore.md`
- `openspec/changes/review-backend-implementations-backend/verify-report.md`
- Prior failed verification evidence revision: `sha256:2f8108f4ee37e68aa5a18fbb998fa4298eaa82e23317e8e10087679d0ec893e6`

The prior verification commands passed, but the authentication boundary remained non-compliant:

1. Header-only Bearer extraction used literal escaped whitespace instead of matching actual header whitespace, so valid documented transport could fail before verification.
2. The file route called `jwt.verify` directly without the shared verifier or an explicit `HS256` allow-list, dereferenced a missing latest version unsafely, and trimmed a missing secret in `generateFileToken`.
3. Focused tests did not establish the required valid/invalid JWT, transport, claim-binding, missing-secret, file-token, missing-version, safe-response, and no-mutation contracts.
4. The prior aggregate strict-TDD record did not prove task-level evidence; the next implementation must record authentication task RED/GREEN/TRIANGULATE/SAFETY-NET evidence.

The prior report also identified upstream validation, staging/cleanup, persistence/idempotency, and broad regression gaps. Those concerns are deliberately deferred from this first stacked change rather than partially addressed here.

## Confirmed product and security invariants

- OnlyOffice callback authentication requires a signed JWT and a present, non-blank `ONLYOFFICE_SECRET`; there is no unsigned or trusted-network fallback.
- JWT verification explicitly permits `HS256` and retains normal `exp` and `nbf` validation.
- Only verified claims may authorize a route. Unverified body fields cannot be merged into or used as an authorization fallback for the claims.
- The verified document identity must bind to the route document ID. Body/claim disagreement fails closed.
- File-token verification uses the same authentication boundary and binds the verified document claim to the requested route.
- The callback remains HTTP 200 and exposes only the existing `{ error: 0 }` or `{ error: 1 }` shape, including for authentication failures.
- Rejected authentication and claim requests must fail before fetch, file, version, audit, or document mutation.

## Scope

### 1. Strict callback JWT transport

- Pass the raw authorization value and raw callback body from the controller to the service without treating body fields as trusted claims.
- Extract one `Authorization: Bearer <token>` value using actual horizontal-whitespace rules. Reject leading or trailing header whitespace, empty tokens, extra fields, non-Bearer schemes, and ambiguous non-string header values.
- Accept one non-blank signed `body.token` transport when no header is supplied. Do not accept a body token with surrounding whitespace.
- When both header and body tokens are supplied, require exact token-string equality. A malformed supplied header is not ignored in favor of a valid body token.

### 2. Central HS256 verification and claim binding

- Centralize callback and file-token verification behind one service verifier.
- Require `typeof secret === 'string' && secret.trim().length > 0` before invoking JWT verification; trim only the configured secret and convert missing or blank configuration to a controlled safe failure.
- Call `jwt.verify` with `algorithms: ['HS256']` and retain the library's normal expiration and not-before checks. Do not use decode-only or algorithm-negotiation fallbacks.
- Accept only a verified non-array object, or a verified plain-object `payload` envelope where that is the existing token shape. Never merge unverified callback body fields into verified claims.
- Validate the minimum route-bound claim contract: supported integer `status`, a `key` matching the route document identity, and an optional integer `documentId` equal to the route ID. For status `2`, require the signed callback fields needed by the existing flow, including a non-empty signed URL and reported user value, without adding URL or upstream validation here.
- If body `status`, `key`, `url`, `users`, or document identity fields are supplied, compare them with the verified claims and reject disagreement before downstream work.

### 3. File-token delegation and safe version failures

- Change the file controller to delegate token verification to `OnlyofficeService.verifyFileToken(token, documentId)` rather than invoking JWT verification directly.
- Have `verifyFileToken` use the central non-blank-secret HS256 verifier, return a safe invalid result, and require the verified document claim to match the route document ID.
- Apply the same non-blank-secret guard to `generateFileToken` while preserving its existing signing purpose and expiry.
- Check for a missing document or missing latest version before reading its path or MIME or constructing a stream. Return the existing generic file failure behavior rather than exposing state or throwing an array-access error.

### 4. Safe callback responses

- Keep callback success and failure responses limited to `{ error: 0 }` and `{ error: 1 }` with HTTP 200.
- Convert missing configuration, token, claim, route, and file-version authentication-boundary failures into the safe failure object. Do not return or expose token, secret, JWT verifier, URL, database, or exception details.
- Preserve supported non-status-2 acknowledgement behavior while ensuring it cannot bypass authentication when a token is supplied or cause a version mutation.

### 5. Highest-value authentication regressions

Modify only the existing OnlyOffice controller and service specs. Prefer parameterized cases and shared fixtures. Cover:

- Header-only, body-only, matching dual-token, mismatched dual-token, malformed, ambiguous, empty, and wrong-scheme transport.
- Missing and blank secrets; malformed, expired, unsigned, and wrong-algorithm tokens; explicit HS256 verification options; and normal expiry rejection.
- Verified direct and nested claim shapes, route key/document mismatch, body/claim disagreement, unsupported status, and missing status-2 signed identity fields.
- File-token delegation, route-bound file claims, missing-secret behavior, invalid file tokens, and missing latest-version handling without stream dereference.
- Safe HTTP 200 callback responses containing only the allowed error property for rejected authentication and claim cases.
- No fetch, file write, version write, audit write, or document update on rejected authentication-boundary requests.
- Existing valid authentication and health/status/file response-shape coverage needed to detect compatibility regressions.

The next implementation phase must record per-task RED, GREEN, TRIANGULATE, and SAFETY-NET evidence for this authentication slice. No test execution is part of this proposal phase.

## Affected areas and allowed surface

| Area | Planned change |
|---|---|
| `src/onlyoffice/onlyoffice.controller.ts` | Forward raw callback authorization/body data, delegate file-token verification, guard absent latest versions, and preserve safe HTTP 200 callback responses. |
| `src/onlyoffice/onlyoffice.service.ts` | Own strict token extraction, shared HS256/expiry verification, claim normalization and route binding, file-token safety, and safe authentication-boundary failures. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Add focused controller tests for delegation, transport forwarding, missing-version behavior, and minimal callback responses. |
| `src/onlyoffice/onlyoffice.service.spec.ts` | Add focused service tests for transport, JWT algorithm/expiry/claims, file tokens, missing secrets, safe failures, and no-mutation behavior. |

No schema, migration, dependency, storage, document-service, deployment, or environment-file change is planned. `ONLYOFFICE_SECRET` is read and validated at the existing service boundary; secret distribution is not redesigned.

## Explicit exclusions and stack boundary

This first stacked change excludes:

- Upstream URL validation, same-origin checks, redirects, timeouts, response status, MIME/type checks, response-size limits, and streaming behavior.
- Immutable file staging, final-path collision handling, filesystem cleanup, orphan handling, reference checks, and historical-path migration.
- Persistent receipts, idempotency, database transactions, row locks, broad concurrency handling, rollback orchestration, and audit persistence redesign. Authentication regressions may assert that rejected requests do not reach those mutation paths, but they will not implement or broadly test them.
- OnlyOffice deployment, networking, callback hosting, topology, or secret-distribution redesign.
- Broad upstream, persistence, cleanup, path, migration, or real-PostgreSQL regression matrices.
- Changes to `DocumentService.saveTextContent`, `StorageService`, dependencies, Prisma schema/migrations, generated output, or unrelated backend modules.
- Edits to pending `.gitignore` or `src/settings/settings.service.ts` changes, `.pi/`, `.codegraph/`, generated/runtime state, or any unrelated working-tree files.
- Commits, pull requests, delivery chaining, and `size:exception` approval.

The later stacked change may address deferred callback processing and persistence concerns separately; this proposal does not presume its implementation details or expand into them.

## Review-budget forecast and gate

The forecast counts additions plus deletions in the four allowed source/test files and is intentionally well below the canonical 400 changed-line budget:

| Work area | Forecast |
|---|---:|
| Controller implementation | 10–20 |
| Service implementation | 45–75 |
| Controller regressions | 25–40 |
| Service regressions | 55–85 |
| **Total** | **135–220** |

There is no schema or migration allowance in this slice. At 400 or more concrete changed lines, work pauses under `ask-on-risk`; no chain strategy or `size:exception` may be inferred. Lower-value authentication cases must be deferred if the forecast materially expands.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A deployed OnlyOffice integration uses an undocumented token transport. | Support only the documented header/body forms, require exact equality for dual transport, and fail closed rather than trust an alternate unsigned path. |
| Missing or blank secret configuration causes legitimate callbacks or file tokens to fail. | Make the non-blank-secret requirement explicit, return generic safe failures, and test both absent and whitespace-only configuration. |
| Stricter HS256 or expiry enforcement rejects legacy tokens. | Make algorithm and time-validation behavior explicit and cover valid HS256 alongside expired, unsigned, and wrong-algorithm cases. |
| Body claims are accidentally trusted after successful token extraction. | Normalize only verified claims, compare supplied body fields rather than merging them, and assert no mutation on disagreement. |
| Route-bound claim checks reject malformed or legacy key envelopes. | Keep the claim contract limited to the existing route identity and supported status requirements, with positive fixtures for the documented verified shapes. |
| Safe error handling changes the callback contract or leaks diagnostics. | Assert HTTP 200 and exact minimal JSON for rejected cases; keep token, secret, verifier, and exception details out of responses. |
| Authentication tests grow beyond the review budget. | Use existing specs, shared fixtures, parameterized cases, and the 220-line forecast; defer lower-value cases and pause at the configured gate. |

## Rollback and recovery

- Revert only the authentication changes in the OnlyOffice controller/service and their focused specs if compatibility requires recovery.
- No schema, migration, or persistent receipt change is introduced, so rollback does not require data migration or receipt cleanup.
- Authentication failures in this slice occur before downstream fetch or mutation; rollback must not include deletion of files, rewriting version history, or cleanup of unrelated working-tree changes.
- If a compatibility issue is found, prefer a forward correction that preserves fail-closed secret, algorithm, expiry, and route-binding guarantees rather than restoring an unsigned or unbound fallback.

## Success criteria

1. Header-only, body-only, and equal dual-token callbacks follow the documented transport contract; malformed, ambiguous, and mismatched transports fail closed.
2. Callback and file-token verification require a non-blank configured secret, explicitly allow only HS256, and enforce normal JWT expiry/not-before validation.
3. Only verified, route-bound claims authorize downstream callback or file work; body/claim disagreement cannot authorize a request.
4. File-token verification is delegated through the service boundary, and missing documents or latest versions fail safely before stream/path dereference.
5. Rejected authentication and claim cases do not fetch, write files, create versions or audits, or update documents.
6. Callback responses remain HTTP 200 with exactly `{ error: 0 }` or `{ error: 1 }` and disclose no authentication or internal failure details.
7. The focused controller/service regressions cover the highest-value authentication cases while preserving existing OnlyOffice response-shape behavior.
8. The implementation-plus-test diff forecasts at 135–220 changed lines and remains below the 400-line review gate; reaching the gate pauses for the configured ask-on-risk decision.

## Next phase and delivery context

The next SDD phase should translate this boundary into minimal authentication requirements, design, and ordered implementation tasks. It must preserve the exclusions above and capture task-level strict-TDD evidence. Apply work must remain limited to the four OnlyOffice source/test files, with no tests or source changes authorized by this proposal phase.

Delivery remains `ask-on-risk` with a canonical 400 changed-line threshold. This first stacked proposal does not select chaining and does not authorize a `size:exception`.
