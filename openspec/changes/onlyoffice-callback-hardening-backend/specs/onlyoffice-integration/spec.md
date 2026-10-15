# OnlyOffice Integration Specification

## Purpose

Define bounded backend behavior for authenticated OnlyOffice callbacks and file tokens, safe upstream retrieval, immutable version persistence, cleanup, and focused regression coverage. This slice does not redesign deployment, storage abstractions, or the wider document subsystem.

## Requirements

### Requirement: Enforce strict JWT transport and verification

The system MUST accept OnlyOffice authentication only from a valid `Authorization: Bearer <token>` header or the documented signed body-token transport. It MUST reject empty, malformed, ambiguous, unsigned, expired, or wrong-algorithm tokens; require a present non-blank `ONLYOFFICE_SECRET`; verify only with HS256; and require equal values when both transports are supplied. Verified document identity MUST agree with the route document ID and callback key before any mutation. The system MUST NOT expose tokens, secrets, verifier details, or sensitive failure diagnostics.

#### Scenario: Callback transport and claims are fail-closed

- GIVEN a callback has header-only, body-only, or equal dual-token authentication with a valid unexpired HS256 token and matching route/key identity
- WHEN the callback is processed
- THEN it MAY proceed to payload validation
- GIVEN either token transport is malformed, dual transports differ, the secret is missing or blank, the token is unsigned, expired, malformed, wrong-algorithm, or identity-mismatched
- WHEN the callback is processed
- THEN it MUST return the safe failure response before mutation and MUST create no version or audit event

### Requirement: Apply the same safe verifier to file tokens

The file-token route MUST use the hardened JWT verifier, require HS256 and a configured secret, bind the verified document identity to the route document ID, and fail safely for invalid configuration, malformed or expired tokens, disallowed algorithms, mismatched claims, or a document without a latest version. It MUST preserve the existing route purpose and response shape.

#### Scenario: File-token boundary rejects unsafe requests

- GIVEN a file-token request has invalid configuration, authentication, claims, or no latest version
- WHEN the route is requested
- THEN it MUST fail without an unsafe dereference, file disclosure, or sensitive diagnostic
- GIVEN the token and route identity are valid and a latest version exists
- WHEN the route is requested
- THEN the existing file response contract MAY be returned

### Requirement: Restrict callback upstream retrieval to a bounded same-origin policy

For status `2`, the system MUST require an absolute credential-free HTTP(S) URL without a fragment and with the configured `ONLYOFFICE_URL` origin, including effective port, as its origin. It MUST follow no more than three redirects, revalidate every hop for origin, credentials, and fragments, reject loops and foreign redirects, apply a ten-second bounded timeout, require a 2xx response, and enforce the maximum response size while streaming and through a valid `Content-Length`. Explicit incompatible content types MUST be rejected; valid empty text content MAY be accepted where supported, while empty binary/office content MUST be rejected. All upstream failures MUST produce the safe callback failure shape without upstream details.

#### Scenario: Unsafe or oversized upstream content is not persisted

- GIVEN a status-2 callback references a credentialed, fragmented, foreign-origin, looping, or invalid URL, or a redirect violates the same rules
- WHEN retrieval is attempted
- THEN the system MUST reject it without fetching or mutating document state
- GIVEN retrieval times out, fails, returns non-2xx or incompatible content, exceeds the limit during streaming, or returns empty binary content
- WHEN retrieval completes or fails
- THEN the system MUST return `{ "error": 1 }` and leave versions, files, checksums, and audits unchanged
- GIVEN a bounded same-origin response is valid, including supported empty text content
- WHEN retrieval completes
- THEN the system MAY continue to staging

### Requirement: Preserve immutable versions and synchronize persistence

Each accepted callback-created version MUST use a unique temporary and final physical path and MUST NOT overwrite any path referenced by a retained `DocumentVersion`. Existing version paths, bytes, checksums, and metadata MUST remain unchanged. Receipt uniqueness, per-document coordination, version creation, current-version/checksum update, and valid supplied-user audit attribution MUST be durable and transactional. An authenticated duplicate MUST be an idempotent success that creates no additional version or audit event.

#### Scenario: A valid save creates one immutable version

- GIVEN an authenticated, validated status-2 callback with a valid audit user
- WHEN persistence commits
- THEN exactly one new version and valid audit event MUST be committed
- AND its path MUST be distinct from retained paths
- AND the document current version and checksum MUST match the new version
- AND all prior bytes, paths, checksums, and metadata MUST remain unchanged

#### Scenario: Duplicate and rollback do not partially commit

- GIVEN an authenticated callback receipt already exists
- WHEN the same callback is processed
- THEN it MUST succeed idempotently without a second version, audit event, or current-version advance
- GIVEN receipt, version, document, or audit persistence fails
- WHEN the transaction rolls back
- THEN no partial receipt/version/audit/current-version state MAY remain

### Requirement: Clean candidates only when reference safety is proven

On validation, filesystem, duplicate, or transaction failure, the system MUST remove temporary candidates and MAY remove final candidates only after a database reference check proves they are unreferenced. If reference status cannot be proven, it MUST retain the candidate for bounded operational cleanup. Cleanup MUST never delete a path referenced by any retained version, and MUST NOT rewrite or broadly clean historical shared-path rows.

#### Scenario: Cleanup protects immutable history

- GIVEN a failed or duplicate callback has temporary or final candidates
- WHEN cleanup runs
- THEN temporary candidates MUST be removed where possible
- AND final candidates MUST be removed only when proven unreferenced
- AND referenced files MUST remain intact
- AND uncertain candidates MUST be retained rather than deleted

### Requirement: Return safe callback responses and validate identity

The public callback MUST return HTTP 200 with only `{ "error": 0 }` for accepted acknowledgements or `{ "error": 1 }` for failures. Authentication, payload, upstream, persistence, missing-document/version, and invalid or unknown-user failures MUST not leak secrets, tokens, URLs, network errors, database details, or unhandled exceptions. A supplied audit user MUST be validated; the system MUST reject invalid or unknown users without fallback attribution.

#### Scenario: Rejected callbacks have no side effects or sensitive output

- GIVEN a callback fails authentication, validation, upstream retrieval, document lookup, or user validation
- WHEN the callback returns
- THEN it MUST return HTTP 200 with `{ "error": 1 }`
- AND MUST create no version or audit event and MUST not advance the document
- AND its response and observable diagnostics MUST omit sensitive details

### Requirement: Use separator-aware path assertions

The implementation and regression assertions MUST normalize paths and use platform-safe, separator-aware relationship checks. They MUST verify intended file relationships without hard-coded slash assumptions or broad wildcard assertions that weaken immutable-path guarantees.

#### Scenario: Path checks remain cross-platform and precise

- GIVEN a stored path is produced on Windows or POSIX
- WHEN path relationships are asserted
- THEN normalized, separator-aware checks MUST identify the intended file and distinct immutable paths without requiring a platform-specific separator

### Requirement: Provide highest-value bounded regression coverage

The focused OnlyOffice service and controller specs MUST cover transport variants; missing/invalid/expired/wrong-algorithm and mismatched JWTs; file-token and missing-latest-version handling; safe responses and no mutation; same-origin URL and redirect bounds; timeout, non-2xx, incompatible type, streamed oversize, empty binary, and valid empty text; immutable history, synchronized checksum/current version, duplicate receipt cleanup, rollback cleanup, referenced-file protection, and audit identity. Existing health, status, file-token, and controller behavior MUST remain covered. Task-level RED, GREEN, TRIANGULATE, and SAFETY-NET evidence MUST be recorded under strict TDD.

#### Scenario: Regression coverage observes the security and integrity contracts

- GIVEN the focused regression suite is run
- WHEN it exercises the listed valid, invalid, duplicate, rollback, cleanup, identity, upstream, and path cases
- THEN each boundary MUST have a regression that observes both the response and relevant side effects
- AND the implementation-plus-regression diff MUST remain below 400 changed lines
- GIVEN the concrete diff reaches 400 changed lines
- WHEN the review-budget gate is reached
- THEN work MUST pause for the configured ask-on-risk decision, with no inferred chain strategy or size exception
