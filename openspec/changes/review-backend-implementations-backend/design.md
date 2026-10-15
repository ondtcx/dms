# Design: Harden the OnlyOffice Backend Integration

## Outcome

Harden only the OnlyOffice callback and file boundaries while preserving the existing public callback shape (`{ error: 0 | 1 }`) and the wider document/version APIs. A callback save is accepted only after HS256 JWT verification, callback/payload validation, bounded same-origin download, immutable file staging, and one PostgreSQL transaction covering the receipt, version, document, and audit writes.

The design deliberately does not migrate historical shared-path rows or repair the separate in-place save behavior in `DocumentService.saveTextContent`. New OnlyOffice callback versions are immutable; existing rows remain readable and are never broadly rewritten.

## Decisions at a glance

| Concern | Decision |
|---|---|
| Callback JWT transport | Accept a JWT from `Authorization: Bearer <token>` or the OnlyOffice `body.token` field. If both are present they must be identical. No unsigned-body fallback. |
| JWT algorithm and claims | Verify with `ONLYOFFICE_SECRET` and `algorithms: ['HS256']`. Accept the verified claims directly or under a plain-object `payload` envelope used by some OnlyOffice versions. Require a numeric status and callback key; reject malformed, expired, or mismatched claims. |
| Callback identity | The signed `key` must match `doc_<routeDocumentId>_...`; an optional signed `documentId` must equal the route parameter. For status 2, signed `url` and `users[0]` are required. The signed user ID is both the version creator and audit actor; there is no owner/fallback substitution. |
| Callback response | Always return HTTP 200 with `{ error: 0 }` for authenticated no-op/applied/duplicate callbacks and `{ error: 1 }` for authentication, validation, upstream, identity, or persistence failures. Do not expose failure reasons, tokens, URLs, secrets, or database details. |
| Upstream URL | Parse `body.url` as an absolute HTTP(S) URL without credentials or fragments. Its origin must equal the configured `ONLYOFFICE_URL` origin. Follow at most three redirects manually, and only to the same origin. |
| Upstream response | Use a bounded timeout (10 seconds), accept only 2xx responses, enforce a 50 MiB limit using `Content-Length` and streamed chunks, and reject explicit incompatible content types. Empty text/markdown content is valid; empty binary/office content is invalid. |
| Physical storage | Download to a unique `uploads/temp` path, then move to a unique `StorageService.generateStructuredPath` destination using `path.join`-based helpers. Never overwrite a path referenced by a version. |
| Idempotency | Add `OnlyofficeCallbackReceipt` with a unique SHA-256 `idempotencyKey`. The key is the route document ID plus canonical signed callback data, excluding JWT transport and volatile `iat`/`exp` claims. Receipts are retained; no TTL is introduced. |
| Concurrency | Use an interactive Prisma transaction. Insert the receipt, lock the document row with PostgreSQL `SELECT ... FOR UPDATE`, reload the latest version, validate the user, create the version, update document checksum/currentVersion, and create the audit event in that transaction. A unique-key `P2002` for the receipt is an authenticated duplicate and returns success after candidate-file cleanup. |
| Existing data | No backfill, path rewrite, or broad cleanup. Existing shared-path version rows remain readable. |

## Data flow

```text
HTTP callback
  │
  ├─ extract one matching JWT transport
  ├─ verify ONLYOFFICE_SECRET + HS256
  ├─ unwrap verified callback claims and compare signed/body fields
  ├─ non-status-2 supported status ────────────────> { error: 0 }
  │
  ├─ validate document key, URL, and signed user
  ├─ preflight document/current version/user and receipt
  ├─ same-origin bounded fetch with manual redirects
  ├─ validate status, content type, size, and empty-content rules
  ├─ write unique temp file and move to unique final path
  │
  └─ Prisma transaction
       ├─ create unique callback receipt
       ├─ lock and reload Document + latest DocumentVersion
       ├─ validate supplied User
       ├─ create immutable DocumentVersion
       ├─ update Document.currentVersion + checksumSHA256
       └─ create DocumentAccess UPDATE
              │
              ├─ commit ──> { error: 0 }
              └─ rollback ─> cleanup unreferenced candidate ─> { error: 1 }
```

The filesystem is not transactional. The final candidate path is created before the database transaction so the committed row always points at an existing complete file. On any failure, cleanup deletes the temp path directly and deletes a final candidate only after checking that no `DocumentVersion` references it. A committed candidate is never cleaned up after the transaction returns.

## JWT transport and claims contract

### Extraction

`OnlyofficeController.handleCallback` passes the request authorization header and raw body to `OnlyofficeService.handleCallback`. The service extracts:

1. `Authorization` with exactly the `Bearer <non-empty-token>` form; or
2. `body.token` when it is a non-empty string.

At least one is required. When both are supplied, the token strings must match. The transport field is removed from the callback data before canonicalization; it is never treated as a business claim. The unsigned body is not trusted to provide `status`, `key`, `url`, or `users` when those values are absent from the verified token.

### Verification

The service trims only the configured secret, rejects missing/blank secrets before calling `jsonwebtoken`, and verifies with:

```typescript
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

`jsonwebtoken` expiration validation is retained. A token with an expired `exp` is rejected; an optional `exp` is not required because deployed OnlyOffice versions may issue signed callback tokens without that registered claim. No `none`, RSA, or algorithm-negotiation fallback is accepted. Token contents and secrets are never logged.

The verified object must be a plain object. If it has a plain-object `payload` property, that object is the callback claim source; otherwise the verified object itself is the source. This accommodates the documented direct-body form and the nested envelope emitted by some OnlyOffice versions without accepting an unverified body variant.

Required callback claims are:

- `status`: integer; supported values are `1`, `2`, `3`, `4`, `6`, and `7`.
- `key`: non-empty string matching `^doc_<routeDocumentId>_[A-Za-z0-9_-]+$`, which binds the editor session to the route document.
- `documentId`, when present: integer or numeric string equal to the route document ID.
- For status `2`: `url` as a non-empty string and `users` as a non-empty array whose first value is a non-empty string.

If the HTTP body also includes signed callback fields, the service compares them with the verified claims and rejects disagreement. `users[0]` is the only accepted audit actor; absent, malformed, or unknown users fail the save rather than falling back to `uploadedById`. Other OnlyOffice fields (`actions`, `lastsave`, `forcesavetype`, and `userdata`) are preserved only as canonical idempotency input and are never used for authorization.

The existing file-token route is hardened through the same service boundary: missing secrets fail closed, file tokens are verified with HS256 explicitly, and the decoded `documentId` must be an integer equal to the route. The route also handles a document with no latest version as a generic not-found failure instead of indexing an empty array.

## URL and response validation

`ONLYOFFICE_URL` is parsed before a callback download. A missing, malformed, or non-HTTP(S) configured URL rejects status 2. The candidate URL must be HTTP(S), contain no username/password or fragment, and have the same `protocol`, `hostname`, and effective port as the configured URL. A path or query on the candidate is allowed because OnlyOffice returns a generated download endpoint.

Fetch behavior is bounded as follows:

- timeout: 10 seconds via `AbortController`;
- redirect mode: `manual`, maximum three hops;
- redirect target: re-run the same origin/credential/fragment check before fetching;
- response status: `200 <= status < 300`; never persist a 3xx, 4xx, or 5xx body;
- size: 50 MiB maximum, checked against a valid `Content-Length` and while reading chunks;
- content type: an absent type is tolerated for compatibility; an explicit type must be `application/octet-stream`, the current version MIME type, or a compatible `text/*` type;
- content usability: zero bytes are allowed only for `text/plain`, `text/markdown`, or another text MIME; zero-byte office/binary content is rejected.

The helper returns only a `Buffer` and safe metadata. Network errors, timeout errors, invalid redirects, oversized bodies, and incompatible responses are converted to a safe failure result. No upstream response body or error string is returned to OnlyOffice or logged verbatim.

## Immutable staging and version persistence

The service obtains the preflight document and latest version before downloading so missing documents or missing current versions fail without a fetch. It retains the latest filename/MIME as the expected editor format, but reloads the authoritative latest row after the transaction lock is acquired.

For a valid response:

1. Derive an extension with `extname(latest.filename || latest.storedName)`.
2. Generate a random UUID-based temp filename under `storage.getPaths().temp`.
3. Write the validated buffer to that temp path.
4. Generate a distinct UUID-based `storedName` and destination with `storage.generateStructuredPath(document.uploadedById, document.categoryId, storedName)`.
5. Move the temp file to the destination using the existing storage helper. The destination is unique and is never an existing version path.
6. Calculate the checksum from the staged final file.
7. Use the destination, stored name, size, checksum, latest filename/MIME, signed editor user, and `REEMPLAZO_MANUAL` source in the transaction.

The transaction updates `Document.currentVersion` to the locked latest version number plus one and sets `Document.checksumSHA256` to the new checksum. It creates `DocumentVersion` before completing the transaction and creates the `DocumentAccess` `UPDATE` event using the validated editor user. The latest-version file route continues to select the highest version and therefore needs no API change.

The service records every candidate temp/final path for cleanup. Temp files are removed directly. Final candidates are removed only when a database query confirms no `DocumentVersion.path` references them. Cleanup is best effort and never deletes a retained historical path. A database rollback therefore cannot leave a currentVersion-only advance, and a filesystem failure cannot overwrite prior bytes.

## Persistent idempotency and Prisma transaction

Add the following model to `prisma/schema.prisma`:

```prisma
model OnlyofficeCallbackReceipt {
  id             String   @id @default(cuid())
  documentId     Int
  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  idempotencyKey String   @unique
  createdAt      DateTime @default(now())

  @@index([documentId])
}
```

Add `onlyofficeCallbackReceipts OnlyofficeCallbackReceipt[]` to `Document`. The migration creates the table, foreign key, unique key, and document index; it contains no data backfill because no historical callback key can be reconstructed safely.

The idempotency key is SHA-256 over a deterministic JSON object with fixed field order:

```text
{
  documentId,
  key,
  status,
  url,
  users,
  actions,
  lastsave,
  forcesavetype,
  userdata
}
```

The JWT string, `token` transport, and volatile registered claims are excluded. The route document ID is included even when a token has no `documentId` claim. The key is computed only from verified claims, so a body-only forgery cannot reserve a receipt.

The persistence callback uses `this.prisma.$transaction(async (tx) => ...)`:

1. Attempt `tx.onlyofficeCallbackReceipt.create`. A unique conflict is handled outside as a duplicate success; all other errors fail.
2. Execute a parameterized PostgreSQL `SELECT` for the document row with `FOR UPDATE` and fail if absent.
3. Read the latest version while the row lock is held and fail if absent.
4. Resolve `users[0]` with `tx.user.findUnique`; fail if unknown.
5. Create the version with `latest.version + 1` and the unique staged path.
6. Update the document checksum and current version.
7. Create the access event for the validated user.

The row lock serializes distinct callbacks for one document, so each sees a distinct sequential version. A duplicate callback that races an in-flight first callback waits on the unique index/transaction; after the first commit it receives `P2002`, cleans its unreferenced candidate, and returns `{ error: 0 }`. If the first transaction rolls back, the retry can insert the receipt and proceed. No process-local map or in-memory lock is used.

## Exact file impact

| File | Action | Design responsibility |
|---|---|---|
| `src/onlyoffice/onlyoffice.controller.ts` | Modify | Pass callback authorization/body to the service, preserve HTTP 200 JSON responses, use service token verification for the file route, and handle empty latest-version results safely. |
| `src/onlyoffice/onlyoffice.service.ts` | Modify | JWT transport/claim verification, file-token hardening, callback validation, same-origin bounded download, canonical key creation, unique staging/cleanup, and transactional persistence. |
| `src/onlyoffice/onlyoffice.service.spec.ts` | Modify | Platform-independent path assertions plus focused JWT, URL/response, staging, missing-version, duplicate, transaction, and cleanup tests. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Modify | Header/body transport selection, safe `{ error: 0 | 1 }` responses, invalid-auth no-mutation behavior, and preserved callback audit contract through the service mock. |
| `prisma/schema.prisma` | Modify | Add `OnlyofficeCallbackReceipt` and its `Document` relation. |
| `prisma/migrations/20261001000000_add_onlyoffice_callback_receipts/migration.sql` | Add | Create the receipt table, unique idempotency key, document foreign key, and index. The timestamp is the planned migration name; it must be reconciled with the repository's migration timestamp before apply. |
| `src/storage/storage.service.ts` | Unchanged | Existing `getPaths`, `generateStructuredPath`, `moveFile`, `deleteFile`, and path helpers are sufficient; no storage abstraction expansion is needed. |
| `src/document/document.service.ts` | Unchanged | Existing manual/editor-basic version behavior and historical data compatibility remain out of scope. |
| `src/onlyoffice/onlyoffice.module.ts` | Unchanged | Existing Prisma and storage providers already satisfy the service dependencies. |
| `.gitignore`, `src/settings/settings.service.ts`, `.pi/` | Unchanged/excluded | Pre-existing working-tree/runtime state is not part of this change. |
| `package.json` and lockfile | Unchanged | `jsonwebtoken`, Node fetch, Prisma, and existing storage APIs are sufficient. |

## Focused test plan

Tests remain in the two existing OnlyOffice specs to protect the review budget. No broad e2e suite or new test fixture framework is planned.

| Test area | Focused assertions |
|---|---|
| JWT transport/claims | Valid direct and nested claims; header-only, body-only, matching dual transport; missing/blank secret; malformed, expired, wrong-algorithm, missing-key, route-key mismatch, documentId mismatch, and dual-token mismatch. Assert no document/file access on authentication failure. |
| Payload and status | Supported non-2 statuses return success without fetch; malformed status 2, missing URL/key/user, and unknown status return failure without fetch or writes. |
| URL/response | Reject non-HTTP(S), credentials, fragments, foreign origins, foreign redirects, timeout, network error, non-2xx, oversized content, incompatible type, and empty binary content. Accept valid same-origin content and empty text content. Assert safe response shape only. |
| Immutable storage | Assert UUID-distinct destination, prior path/checksum/bytes untouched, new version metadata, synchronized document checksum/currentVersion, and latest-version selection. Use `path.join`, `path.normalize`, and `path.sep` rather than slash literals. |
| Idempotency/concurrency | Mock receipt uniqueness for duplicate callbacks; assert one version and one audit event. Exercise two transaction callbacks with a row-lock-capable fake and assert sequential versions and final checksum. Assert transaction rejection leaves no database writes and cleans only the candidate. |
| Identity and missing records | Missing document, missing latest version, malformed user, and unknown user return failure without fallback attribution or unsafe array access. |
| Existing behavior | Keep health response/status handling, file-token verification, status-2 success, and reported-user `UPDATE` audit coverage. |

Unit tests may mock Prisma's interactive transaction and filesystem boundaries; the transaction test must still assert operation ordering and the `FOR UPDATE` query shape. A real PostgreSQL concurrency test is not added in this bounded slice; the SQL lock is kept explicit and can be covered by the existing e2e infrastructure in a later dedicated change if production evidence requires it.

## Migration, rollout, rollback, and cleanup

1. Apply the receipt migration before deploying the callback code. Prisma client generation is required as part of implementation tooling, but no dependency change is required.
2. Deploy the service/controller changes together. Existing callbacks lacking a valid OnlyOffice JWT will fail closed; this is an intentional security gate, not a trusted-network compatibility mode.
3. Existing version rows and files are untouched. New callback rows use unique active storage paths; no historical shared-path migration is attempted.
4. If staging succeeds but validation or transaction persistence fails, remove only the candidate temp/final path after the reference check. An orphan that cannot be safely proven unreferenced remains for bounded operational cleanup rather than risking retained history.
5. A source rollback can leave the receipt table and rows in place; the old application ignores the extra table. Do not routinely down-migrate after receipts exist. If the migration itself must be reverted before application deployment, verify no receipt rows exist first.
6. Do not reintroduce in-place callback overwrites during rollback. Reverting the code must not delete immutable files or rewrite historical paths; restoration remains the existing explicit version-restore operation.

## Tradeoffs and rejected alternatives

| Alternative | Decision and reason |
|---|---|
| Trust a private network or callback URL alone | Rejected; it does not authenticate a public endpoint and contradicts the fixed JWT decision. |
| Accept only an unsigned body plus a shared header | Rejected; body fields would remain forgeable and transport variants would be ambiguous. |
| Use the JWT string as the idempotency key | Rejected; retries can receive a newly signed token with different timestamps. Canonical signed callback data is stable for the same save. |
| Use only an in-memory deduplication map | Rejected; it fails across processes and restarts. |
| Optimistic `currentVersion` update without a row lock | Rejected; it forces avoidable retry failures and does not provide the requested serialized distinct callbacks. |
| Overwrite the current path then copy it to history | Rejected; a failure or concurrent reader can corrupt immutable history. |
| Broadly rewrite existing shared-path rows | Rejected; it exceeds scope and cannot safely infer historical bytes after in-place overwrites. |
| Add a new storage abstraction or dependency | Rejected; existing path, move, delete, and hash helpers are sufficient for this focused slice. |
| Return upstream/database error details | Rejected; callback callers receive only the documented error flag and safe server diagnostics. |

## Changed-line forecast and workload gate

| File/group | Forecast (changed lines) |
|---|---:|
| Controller implementation | 45–55 |
| Service implementation | 120–145 |
| Prisma schema + migration | 35–45 |
| Service tests | 75–90 |
| Controller tests | 55–70 |
| **Total forecast** | **330–400** |

The current design is intentionally forecast at the canonical 400-line boundary, with a likely center around 365 lines. The implementation phase must count additions plus deletions before broadening tests. If the concrete diff exceeds 400 changed lines, pause under `ask-on-risk`; do not select a chain strategy or infer `size:exception`. The forecast excludes unrelated pending `.gitignore`, `src/settings/settings.service.ts`, and `.pi/` state.

## Implementation sequence

1. Add the Prisma receipt model and migration SQL shape; generate the client during implementation.
2. Extract service-level JWT/file-token helpers and callback claim normalization.
3. Add URL/response validation and bounded download behavior.
4. Add immutable temp/final staging and reference-safe cleanup.
5. Add the interactive transaction, row lock, receipt uniqueness handling, and audit attribution.
6. Adapt the controller to the service result and safe response contract.
7. Update the two focused specs, replacing slash literals with platform-safe path assertions.
8. Count the diff against 400 lines before any optional test expansion.

## Open questions

None for the fixed scope. The only later workload decision is the configured `ask-on-risk` gate if implementation exceeds 400 changed lines.
