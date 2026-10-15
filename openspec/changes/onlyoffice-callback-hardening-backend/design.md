# Design: Harden the OnlyOffice Backend Callback

## Outcome

Harden only the OnlyOffice callback and file-token boundaries while preserving the public callback contract (`HTTP 200` with `{ error: 0 | 1 }`) and the wider document/version APIs. A status-2 save is accepted only after authenticated HS256 claims, same-origin bounded retrieval, immutable staging, reference-safe cleanup, and one serialized Prisma transaction.

This remediation preserves the prior failed change and its receipt migration as evidence. It does not migrate historical shared paths, redesign deployment, add storage abstractions, or change `DocumentService.saveTextContent`.

## Decisions at a glance

| Concern | Decision |
|---|---|
| Callback transport | Accept one strict `Authorization: Bearer <token>` header or one signed `body.token`; reject malformed/ambiguous values. If both exist, their exact token strings must match. |
| JWT verification | Require a non-blank `ONLYOFFICE_SECRET`; trim only the configured secret; call `jwt.verify` with `algorithms: ['HS256']`; retain normal `exp`/`nbf` validation; never log token, secret, or verifier errors. |
| Callback claims | Use only the verified direct object, or its verified plain-object `payload` envelope. Require supported integer `status` and a `key` matching `doc_<routeId>_...`; an optional integer `documentId` must equal the route. Status 2 also requires signed `url` and `users[0]`. |
| File token | The controller delegates to `OnlyofficeService.verifyFileToken(token, documentId)`, which reads configuration, verifies HS256, and binds the integer claim to the route. Missing latest versions fail as a generic not-found response before stream creation. |
| Upstream | Validate configured and callback URLs as credential-free HTTP(S) URLs with equal origins. Manually follow only three same-origin redirects, with one ten-second overall timeout, 2xx-only responses, and bounded streaming. |
| MIME/size | Reject invalid or oversized `Content-Length`, enforce 50 MiB while reading chunks, and require an absent or compatible content type. Empty content is valid only for text document MIME types. |
| Persistence | Stage a UUID temp file and UUID final path before the transaction. Lock the document row, detect/create the receipt, validate the user, create the version, update current version/checksum, and create the `UPDATE` audit event in one transaction. |
| Duplicate | An authenticated existing receipt is idempotent success. It creates no version, audit row, or document update; any staged final candidate is deleted only after proving it is unreferenced. |
| Cleanup | Delete temp candidates directly. Delete final candidates only after `DocumentVersion.path` lookup proves no reference; if the lookup or deletion safety cannot be proven, retain the candidate for bounded operational cleanup. |
| Budget | Forecast 335–385 changed lines for implementation plus focused tests. At 400 or more additions plus deletions, pause and ask under `ask-on-risk`; do not infer chaining or `size:exception`. |

## Data flow

```text
callback request
  -> extract header/body JWT transport
  -> require secret and verify HS256
  -> normalize signed claims and compare supplied body fields
  -> supported non-status-2 callback -> { error: 0 }
  -> validate route/key, signed URL, and signed audit user
  -> load document/latest version for format and storage context
  -> validate configured origin and fetch with bounded redirects/stream
  -> write unique temp path and move to unique final path
  -> transaction: lock document, receipt, user, version, document, audit
       commit -> { error: 0 }
       rollback/validation failure -> reference-safe cleanup -> { error: 1 }
```

The controller catches all callback exceptions and returns only the safe error object. The service also returns that shape from its outer boundary, so neither upstream, JWT, filesystem, Prisma, URL, nor token details cross the public endpoint.

## JWT transport and claims

### Exact extraction contract

`OnlyofficeController.handleCallback` passes the raw request authorization value and raw body to the service. The service treats an absent header as absent, but any supplied non-string header value (including an array) is ambiguous and fails. A string header must match:

```text
^Bearer[ horizontal-whitespace]+([^ whitespace]+)$
```

The implementation should use an explicit ASCII space/tab expression rather than a literal escaped `\\s`, and must reject leading/trailing header whitespace, an empty token, additional fields, and other schemes. `body.token` must be a non-empty compact token string with no surrounding whitespace. If both transports are supplied, compare the captured header token and body token exactly.

A malformed supplied header is not ignored in favor of a valid body token. The token transport field is never treated as a business claim. Body `status`, `key`, `url`, and `users` values are advisory only and, when present, must deep-equal the corresponding verified claims; missing body fields do not authorize anything.

### Verification and claim normalization

Use one private verifier for callbacks and file tokens:

```typescript
jwt.verify(token, secret.trim(), { algorithms: ['HS256'] });
```

Before calling it, require `typeof secret === 'string' && secret.trim().length > 0`. `jsonwebtoken` must perform its normal expiration/not-before checks; no decode-only or algorithm-negotiation fallback is permitted. The verified result must be a non-array object. If it contains a plain-object `payload`, use that signed nested object; otherwise use the verified object itself. Never merge unverified body fields into the claim object.

Callback claims are exact as follows:

- `status`: integer in `1, 2, 3, 4, 6, 7`.
- `key`: non-empty string matching `^doc_<documentId>_[A-Za-z0-9_-]+$`.
- `documentId`, if supplied: integer equal to the route parameter; do not coerce arbitrary strings.
- For status `2`, `url`: non-empty string; `users`: non-empty array whose first item is a non-empty string.
- `actions`, `lastsave`, `forcesavetype`, and `userdata` are retained only as verified idempotency input and never authorize a request.

The key prefix and optional claim bind the signed editor session to the route before document mutation. Unknown or invalid audit users fail closed; there is no fallback to `uploadedById`.

### File-token boundary

Change `verifyFileToken` to receive `(token: unknown, documentId: number)` and read the secret internally. It returns the verified document claim or `null`; it never throws token details. `generateFileToken` uses the same non-blank-secret guard and continues signing with HS256 and the existing one-day expiry.

`getFile` rejects a null verifier result with the existing generic unauthorized response, queries the document only after verification, and checks `document.versions?.[0]` before reading its path or MIME. A missing document or latest version is a safe generic not-found failure, not an array access. The route response remains the existing `StreamableFile` plus content headers.

## Same-origin upstream retrieval

Implement private helpers in `onlyoffice.service.ts` so validation is applied both to the initial URL and every redirect target.

1. Parse `ONLYOFFICE_URL`; reject missing, malformed, non-HTTP(S), credentialed, or fragmented configuration. Compare URL `.origin`, which includes protocol, hostname, and effective default/non-default port.
2. Parse the signed callback URL as an absolute HTTP(S) URL. Reject credentials and fragments. A path and query are allowed because OnlyOffice supplies a generated download endpoint.
3. Fetch with `{ redirect: 'manual', signal }`. Use one `AbortController` and ten-second timer for the entire redirect sequence, not ten seconds per hop.
4. Treat 301, 302, 303, 307, and 308 as redirects. Require a `Location`, resolve it against the current URL, reject loops using normalized visited URLs, and reapply the origin/credential/fragment policy before the next fetch. Permit at most three hops; all other 3xx and all non-2xx statuses fail.
5. Validate `Content-Length` when present: it must be an unsigned decimal representing at most `50 * 1024 * 1024` bytes. Read `response.body` with a reader, accumulating chunks only after checking the running total; cancel the reader on overflow. A compatibility fallback to `arrayBuffer()` must apply the same post-read bound. A missing body is an empty buffer.
6. Normalize the explicit media type before `;`. If absent, use the latest version MIME as the effective type. Accept the latest MIME exactly, and allow `application/octet-stream` only for a non-text latest MIME. Reject every other explicit type, including HTML for an office/text document. Permit a zero-byte body only when the latest MIME is `text/*`; reject empty office/binary content.
7. Convert timeout, fetch, redirect, status, MIME, size, and body errors to `{ error: 1 }` without returning or logging response bodies, URLs, or error strings.

The latest version is loaded before retrieval so MIME, filename, owner, and category are known. The transaction reloads it after the row lock and treats it as authoritative.

## Immutable staging and transaction

For a valid non-empty/allowed response:

1. Derive the extension from `latest.filename || latest.storedName`.
2. Generate a UUID temp filename under `storage.getPaths().temp`; if the path already exists, retry. Write the validated buffer and track the temp path immediately.
3. Generate a UUID final `storedName` with the same extension and use `storage.generateStructuredPath(lockedDocument.uploadedById, lockedDocument.categoryId, storedName)`. Check that the destination does not exist and retry the UUID on collision before using the existing move helper. The destination is never a retained version path.
4. Move the temp file to the final location, track the final path, and compute the SHA-256 from the validated buffer. Do not overwrite or rewrite any existing `DocumentVersion.path`.
5. Compute a deterministic idempotency key from an object with fixed field order: `documentId`, `key`, `status`, `url`, `users`, `actions`, `lastsave`, `forcesavetype`, and `userdata`. Hash the JSON with SHA-256. Exclude the JWT transport and volatile `iat`/`exp` values.

Use `this.prisma.$transaction(async (tx) => ...)` with this order:

1. Execute a parameterized PostgreSQL `SELECT id FROM "Document" WHERE id = $1 FOR UPDATE` to serialize callbacks for one document.
2. Reload the document and latest version while holding the lock; fail if either is absent.
3. Look up the idempotency receipt. If it exists, raise an internal duplicate sentinel so the transaction makes no writes.
4. Create the receipt, resolve `claims.users[0]` with `tx.user.findUnique`, and fail if the user is unknown.
5. Create `DocumentVersion` with `latest.version + 1`, the unique final path, latest filename/MIME, buffer size/checksum, `REEMPLAZO_MANUAL`, and the supplied user.
6. Update `Document.currentVersion` and `checksumSHA256` to the new version/checksum.
7. Create `DocumentAccess` with `{ documentId, userId: claims.users[0], action: 'UPDATE' }`.

A unique receipt conflict is classified as duplicate only after confirming the same idempotency key exists; no generic `P2002` is treated as success. Duplicate cleanup then removes the unreferenced final candidate and returns `{ error: 0 }`. Any other transaction error returns `{ error: 1 }` after cleanup. A rollback therefore removes receipt/version/audit writes and cannot leave a current-version-only advance.

## Reference-safe cleanup

Track both candidate paths through every failure branch. Temp cleanup calls the existing storage delete helper (or direct filesystem unlink through the existing helper) and ignores only cleanup errors. Final cleanup first queries `DocumentVersion.findFirst({ where: { path: finalPath }, select: { id: true } })` on the database. It may delete only when the query succeeds and returns no row. If the query fails, a reference is found, or deletion safety is otherwise uncertain, retain the final file for bounded operational cleanup. Never delete by filename pattern, directory, document ID, or wildcard.

Cleanup runs for URL/body validation after staging, filesystem failure, duplicate receipt, transaction rollback, and any outer failure after a candidate exists. A successfully committed final path is marked committed and is never cleaned. Existing shared-path history is not inspected for rewriting or migrated; a referenced path always wins over orphan removal.

## Migration compatibility

The repository already contains the receipt model, `Document.onlyofficeCallbackReceipts` relation, and `20261001000000_add_onlyoffice_callback_receipts/migration.sql` from the prior change. Their required shape is:

- `OnlyofficeCallbackReceipt(id cuid, documentId, idempotencyKey unique, createdAt)`;
- cascade foreign key from `documentId` to `Document`;
- unique `idempotencyKey` index and `documentId` index.

Do not add a second receipt table migration, rename the model, remove committed receipts, or down-migrate after receipts exist. Reconcile `prisma/schema.prisma` or that migration only if the target branch demonstrably lacks or differs from this existing shape; never rewrite an already-applied migration. Apply the existing migration before deploying code in an environment where it is pending, and generate the Prisma client as implementation tooling. Existing receipt rows are valid inputs and make matching authenticated callbacks idempotent.

A source rollback leaves the table and rows in place. The code must continue to tolerate existing receipts and must not delete immutable files or rewrite historical paths during rollback.

## Exact edit surfaces

| Path | Symbols/surface | Action |
|---|---|---|
| `src/onlyoffice/onlyoffice.controller.ts` | `getFile`, `handleCallback` | Modify: delegate file-token verification, guard absent latest version, pass raw callback authorization/body, and preserve HTTP 200 safe JSON. |
| `src/onlyoffice/onlyoffice.service.ts` | `generateFileToken`, `verifyFileToken`, `handleCallback`; new private JWT/URL/body/stream/staging/cleanup helpers | Modify: centralize HS256 verification, bounded retrieval, immutable staging, receipt transaction, and safe failure handling. |
| `src/onlyoffice/onlyoffice.service.spec.ts` | existing service describes and fixtures | Modify: focused JWT, stream, URL, MIME, missing-version, storage, duplicate, rollback, identity, audit, and path tests. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | callback/file controller tests | Modify: transport forwarding, safe response, file-token delegation, and missing-version boundary tests. |
| `prisma/schema.prisma` | existing receipt model/relation | Verify only; no logical change is expected because the prior receipt shape is already present. |
| `prisma/migrations/20261001000000_add_onlyoffice_callback_receipts/migration.sql` | existing receipt migration | Verify/reconcile only if unapplied branch state differs; do not create a second migration or edit an applied migration. |

`src/storage/storage.service.ts`, `src/document/document.service.ts`, `src/onlyoffice/onlyoffice.module.ts`, dependencies/lockfiles, `.gitignore`, `src/settings/settings.service.ts`, `.pi/`, and deployment/configuration files are explicitly unchanged.

## Focused regression plan

Keep tests in the two existing OnlyOffice specs and use parameterized fixtures/shared helpers to protect the line budget.

| Area | Required observations |
|---|---|
| Transport and claims | Header-only, body-only, equal dual token, mismatched dual token, malformed/ambiguous header, missing/blank secret, malformed/expired/unsigned/wrong-algorithm token, route key/document mismatch, and body/claim mismatch. Assert no fetch, file write, version, or audit mutation on rejection. |
| File route | Same verifier rejects invalid configuration/token/algorithm/claim, valid route-bound token succeeds, and missing latest version fails without stream dereference. |
| Upstream | Reject credentialed/fragmented/foreign/invalid URLs, foreign or looping redirects, fourth redirect, timeout/network error, non-2xx, invalid/oversized `Content-Length`, streamed overflow, and incompatible MIME. Accept bounded same-origin response and valid empty text; reject empty binary. Assert only `{ error: 1 }`. |
| Immutable persistence | Assert UUID-distinct temp/final paths, previous path/bytes/checksum/metadata unchanged, new version/checksum/current version synchronized, and supplied valid user owns the audit/version rows. Use `path.normalize`, `path.relative`, and `path.sep` rather than slash literals or wildcard path assertions. |
| Duplicate/rollback cleanup | Existing receipt produces no second version/audit/current update; staged duplicate final is deleted only when unreferenced; transaction rejection cleans unreferenced candidates; reference lookup failure or an existing reference prevents deletion. |
| Existing behavior | Retain health, supported non-status-2 handling, valid status-2 response, file response shape, and controller safe-response coverage. |

Use a fake streaming reader for chunk-boundary overflow rather than only a large in-memory `arrayBuffer` fixture. Mock the interactive transaction to assert lock-before-receipt and receipt/version/document/audit ordering. Do not add real-PostgreSQL concurrency infrastructure in this slice.

Implementation must record task-level RED, GREEN, TRIANGULATE, and SAFETY-NET evidence. This design phase intentionally runs no tests and records no execution evidence.

## Rollout and rollback

1. Confirm the existing receipt migration is applied or apply it before deploying callback code; do not down-migrate after rows exist.
2. Deploy controller/service changes together. Missing or invalid OnlyOffice JWT configuration intentionally fails closed.
3. Observe safe callback failures and candidate cleanup operationally without exposing upstream/database details. Any uncertain orphan remains for a bounded cleanup procedure that performs the same reference check.
4. If runtime compatibility requires rollback, revert only the callback hardening source/test change. Preserve the receipt table, committed versions, audit history, and all immutable files; do not pattern-delete candidates or rewrite historical paths.
5. A migration rollback is allowed only before application deployment and only after confirming no receipt rows exist. Normal recovery never mixes this slice with unrelated working-tree cleanup or deployment redesign.

## Changed-line forecast and hard gate

The forecast counts additions plus deletions in implementation and focused regression files; the design artifact and unrelated working-tree changes are excluded.

| Work area | Forecast |
|---|---:|
| Controller implementation | 18–28 |
| Service implementation | 115–135 |
| Controller regressions | 32–42 |
| Service regressions | 160–180 |
| Schema/migration reconciliation | 0–10 |
| **Total** | **325–395** |

The intended center is approximately 360 changed lines and remains below the canonical 400-line review budget. Before optional test cases are added, implementation must count the concrete diff. At 400 or more changed lines, pause and ask for the configured `ask-on-risk` decision; do not invent a chain strategy, widen scope, or accept `size:exception`.

## Implementation sequence

1. Verify the existing receipt schema/migration shape without changing it unless drift is proven.
2. Add strict transport extraction and one HS256 verifier, then harden file-token delegation and missing-version handling.
3. Add URL-origin/redirect/timeout/content-type/stream-bound helpers.
4. Add unique staging and reference-safe cleanup around the interactive locked transaction.
5. Add focused regressions in small parameterized batches, recording RED/GREEN/TRIANGULATE/SAFETY-NET evidence per task.
6. Count the implementation-plus-test diff before any optional coverage; stop at the budget gate.

## Non-goals and unresolved decisions

There are no open product decisions for this bounded slice. Deployment topology, secret distribution, broad history repair, storage redesign, API redesign, and real-PostgreSQL concurrency expansion remain excluded. The only delivery decision is the explicit `ask-on-risk` pause at 400 changed lines.
