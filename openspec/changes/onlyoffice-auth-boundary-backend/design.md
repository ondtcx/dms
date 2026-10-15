# Design: Establish the OnlyOffice Authentication Boundary Backend

## Outcome

Harden the OnlyOffice callback and file-token authentication boundaries in the first stacked change to `main`. Valid requests retain the existing downstream behavior; rejected requests fail closed before fetch, file, version, audit, or document mutation. The callback remains HTTP 200 with exactly `{ error: 0 }` or `{ error: 1 }`.

This slice changes only the existing OnlyOffice controller/service and their focused specs. It does not redesign upstream retrieval, persistence, cleanup, concurrency, storage, schemas, deployment, or unrelated pending work.

## Decisions at a glance

| Concern | Decision |
|---|---|
| Callback transport | Pass raw header and body to the service. Accept one strict `Bearer` header or one untrimmed, non-blank body token; require exact equality when both are present. |
| Header grammar | Match `^Bearer[ \\t]+([^\\s]+)$`; scheme is `Bearer`, horizontal whitespace is space/tab, and leading/trailing whitespace, extra fields, empty tokens, wrong schemes, and non-string values fail. |
| Secret | Read `ONLYOFFICE_SECRET` at the service boundary. Require a string whose trimmed value is non-blank; trim only the configured secret and never the token. |
| JWT verification | Use one private verifier for callbacks and file tokens: `jwt.verify(token, secret.trim(), { algorithms: ['HS256'] })`. Library `exp` and `nbf` checks remain enabled. |
| Claims | Accept only a verified plain object, or its verified plain-object `payload` envelope. Never merge body data into claims. |
| Route binding | Require supported integer `status`, a `key` matching `^doc_<routeId>_[A-Za-z0-9_-]+$`, and optional integer `documentId` equal to the route. Status 2 additionally requires a non-empty signed URL and `users[0]`. |
| File token | `getFile` calls `verifyFileToken(token, documentId)`. That service method reads configuration, uses the shared verifier, and returns `null` for every invalid boundary case. |
| Missing file state | Query the document only after token verification. Treat a missing document or `document.versions?.[0]` as the existing generic not-found failure before path, MIME, or stream access. |
| Callback response | Keep `@HttpCode(200)` and `res.json`. Normalize any service result to the two-property public shape, and map every exception to `{ error: 1 }`. |
| Review gate | Forecast 135–220 additions plus deletions in the four allowed files. At 400 changed lines, pause under `ask-on-risk`; do not infer chaining or `size:exception`. |

## Data flow

```text
callback request
  -> controller forwards raw body and raw authorization value
  -> service extracts exactly one token
  -> service requires secret and verifies HS256 with normal time checks
  -> service normalizes verified claims and compares supplied body fields
  -> route/status/required status-2 claim checks
  -> existing status acknowledgement or existing status-2 processing

file request
  -> controller delegates token and route ID to service verifier
  -> shared secret/HS256/claim verifier returns claims or null
  -> controller loads document/latest version
  -> missing document/version returns generic not-found
  -> existing stream response is created only for a verified, complete file
```

Authentication checks must precede the existing callback document query, URL fetch, filesystem write/move, transaction, version creation, document update, and access/audit creation. This design does not alter the existing post-auth upstream or persistence implementation except where an auth result controls entry to it.

## Exact JWT transport and claim contract

### Transport extraction

Change `OnlyofficeController.handleCallback` to pass `req?.headers?.authorization` without normalization and pass the original `body`. The service callback parameter is `body: unknown` and the authorization parameter is `authorization?: unknown`, so an array or other ambiguous header value cannot be silently accepted.

The service first validates the body as a non-null, non-array object. Transport rules are:

1. If the authorization property is absent (`undefined`), there is no header transport. Any other non-string header value is malformed and fails immediately.
2. A string header must match `^Bearer[ \\t]+([^\\s]+)$` exactly. The capture is the token; the header is not trimmed. This accepts one or more actual spaces/tabs between scheme and token, but rejects leading/trailing whitespace, empty tokens, embedded whitespace, extra fields, and all other schemes.
3. If the body has its own `token` property, it must be a string with length greater than zero, `token === token.trim()`, and no whitespace. A missing property is absent transport; `null`, arrays, empty strings, and whitespace-padded values are invalid supplied transports.
4. With both valid transports, require exact string equality. A supplied malformed header is never ignored in favor of a body token.
5. Select the header token when present, otherwise the body token. The `token` field is transport only and is never copied into or compared as a business claim.

The extraction helper returns a token or `null`; it does not throw, log, decode, or fall back to unsigned body fields.

### Shared verification

Implement one private service verifier, conceptually `verifyToken(token: unknown): Record<string, unknown> | null`, used by both callback authentication and file-token verification. It obtains the configured secret through `ConfigService` and returns `null` without calling `jwt.verify` when:

- the secret is not a string; or
- `secret.trim().length === 0`.

For a string token and valid secret, it calls exactly:

```typescript
jwt.verify(token, secret.trim(), { algorithms: ['HS256'] });
```

The helper accepts only an object result that is not an array. A string payload, `null`, array, malformed token, unsigned token, expired token, not-yet-valid token, and every algorithm other than HS256 return `null` through the same catch boundary. No `jwt.decode`, `ignoreExpiration`, algorithm inference, or verifier error is exposed.

### Claim normalization and route binding

JWT results are normalized without adding any request data:

- If the verified result has an own `payload` property, that property must be a plain object and becomes the claims object. A malformed envelope is rejected rather than falling back to another object.
- Otherwise the verified result itself must be a plain object and becomes the claims object.
- Plain object means a non-array object with `Object.prototype` (or `null`) as its prototype. Primitive, array, and class-instance payloads are rejected.

Callback claims are then validated exactly as follows:

- `status` is an integer in `1, 2, 3, 4, 6, 7`.
- `key` is a string matching `^doc_<documentId>_[A-Za-z0-9_-]+$`, where `<documentId>` is the numeric route parameter.
- `documentId`, when present in signed claims, is an integer (no string coercion) equal to the route parameter.
- For `status === 2`, `url` is a non-empty signed string and `users` is a non-empty array whose first value is a non-empty string.

If the raw body supplies any of `status`, `key`, `documentId`, `url`, or `users`, the value must deep-equal the corresponding verified claim. A supplied field that is absent from the claims is disagreement. The body is never merged into the verified object, and fields such as `actions`, `lastsave`, `forcesavetype`, and `userdata` are used only from verified claims by the existing downstream idempotency input.

For an authenticated supported non-status-2 callback, return `{ error: 0 }` without document or version work. For status 2, complete the existing downstream flow only after all signed identity requirements pass. Any failed check returns `{ error: 1 }` before downstream work.

## File-token delegation and version safety

`OnlyofficeService.verifyFileToken` changes from `(token, secret)` to `(token: unknown, documentId: number)`. It reads `ONLYOFFICE_SECRET` internally and delegates to the shared verifier. It returns `{ documentId }` only when the normalized verified claims contain an integer `documentId` equal to the requested route; otherwise it returns `null`. Nested `payload` claims use the same normalization as callbacks.

`generateFileToken(documentId, secret)` retains HS256 and the existing `expiresIn: 86400` signing purpose. Before `jwt.sign`, it applies the same string/non-blank guard and signs with `secret.trim()`. A missing or blank secret throws a controlled `BadRequestException` from this internal editor-configuration path and never calls `jwt.sign`; callback/file verification instead returns safe failure results.

Remove direct `jsonwebtoken` and secret lookup from `OnlyofficeController.getFile`. The controller calls `verifyFileToken(token, documentId)` and maps a null result to the existing generic `UnauthorizedException('Token inválido o expirado')`. Only after verification it queries Prisma. It stores `const latestVersion = document?.versions?.[0]` and maps either a missing document or missing latest version to `NotFoundException('Documento no encontrado')`. It must not read `path`, `mimetype`, or invoke `createReadStream` before that guard. The successful response remains the existing `StreamableFile` and content headers.

## Controller response behavior

Keep `@Public()`, `@Post('callback/:documentId')`, `@HttpCode(200)`, and the current response-injection fallback used by direct unit tests (`response || req`). The controller forwards raw request values exactly once to `OnlyofficeService.handleCallback`.

On a returned service value, send only `{ error: 0 }` when `result?.error === 0`; send `{ error: 1 }` for all other values. On any thrown error, send `{ error: 1 }`. Thus a future service regression or test double cannot leak JWT, secret, URL, Prisma, filesystem, or exception properties. No status code other than HTTP 200 is introduced for callback failures.

## Focused test fixtures and observations

Modify only the two existing OnlyOffice specs. Use shared constants/helpers rather than repeating token setup:

```text
SECRET = 'onlyoffice-secret'
ROUTE_ID = 42
CLAIMS = { status: 2, key: 'doc_42_save_1', url: 'http://onlyoffice.test/file', users: ['editor-1'] }
signClaims(payload, options) -> jwt.sign(payload, SECRET, { algorithm: 'HS256', ...options })
```

The service fixture should provide `config.get`, `storage.generateStructuredPath`, `storage.getPaths`, `storage.moveFile`, `storage.deleteFile`, and `storage.calculateFileHash` mocks, plus Prisma `document.findUnique`, `$transaction`, and the mutation methods needed by the existing status-2 path. Reset `fetch`, `fs.writeFileSync`, storage, Prisma, and transaction mocks between cases. Reuse the existing health and blank-document fixtures unchanged except for fixture typing/order corrections.

Required service observations, preferably as `it.each` tables:

- header-only, body-only, equal dual-token, mismatched dual-token, leading/trailing/extra-field/wrong-scheme/empty header, non-string header, and invalid body transport;
- missing and whitespace-only secret, malformed/expired/not-before/unsigned/wrong-algorithm tokens, and a spy asserting the explicit `{ algorithms: ['HS256'] }` option;
- valid direct claims, valid nested plain-object `payload`, array/primitive/malformed-envelope claims, unsupported status, key mismatch, integer document mismatch, body/claim disagreement, and missing status-2 URL/user;
- invalid callback cases assert `{ error: 1 }` and no fetch, `fs.writeFileSync`, storage move, Prisma document fetch, version write, access/audit write, or document update;
- `verifyFileToken` valid/mismatched/invalid/expired/wrong-algorithm/missing-secret cases, plus `generateFileToken` missing/blank-secret rejection and valid one-day HS256 signing;
- authenticated non-status-2 acknowledgement returns `{ error: 0 }` with no mutation calls.

The controller fixture must instantiate dependencies in constructor order: OnlyOffice service, document service, Prisma service, and (if retained) configuration service. Add focused tests that:

- assert callback forwarding preserves the raw header/body and callback output is exactly `{ error: 0 }` or `{ error: 1 }`, including a service result containing an extra property;
- assert `getFile` delegates `(token, documentId)`, rejects a null verifier before Prisma access, and returns the existing stream contract for a valid verifier;
- assert missing document and empty `versions` both throw the generic not-found exception and `createReadStream` is not called.

These tests observe boundary behavior, delegation, call ordering, and no-mutation guarantees without adding integration infrastructure or testing excluded upstream/persistence concerns.

## Exact edit surfaces

| Path | Symbols | Action |
|---|---|---|
| `src/onlyoffice/onlyoffice.controller.ts` | constructor imports, `getFile`, `handleCallback` | Remove controller JWT/secret verification; delegate file verification; guard latest version; forward raw callback data; enforce minimal callback JSON. |
| `src/onlyoffice/onlyoffice.service.ts` | `generateFileToken`, `verifyFileToken`, `handleCallback`; new private token/claim helpers | Add strict transport extraction, shared configured HS256 verification, verified claim normalization/binding, and file-token safety while leaving existing post-auth processing bounded to this slice. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | callback and file fixtures/tests | Correct dependency fixtures and add delegation, safe response, raw forwarding, and missing-version regressions. |
| `src/onlyoffice/onlyoffice.service.spec.ts` | security-boundary describe and shared fixtures | Add parameterized transport/JWT/claim/file-token/missing-secret/no-mutation regressions; preserve existing health and blank-document coverage. |

Do not edit `src/onlyoffice/onlyoffice.module.ts`, Prisma schema/migrations, `src/storage/storage.service.ts`, `src/document/document.service.ts`, dependencies/lockfiles, configuration files, generated output, or unrelated pending files.

## Rollback and recovery

Rollback is a source-only revert of the authentication changes in the four listed OnlyOffice files. No schema, migration, receipt, or persistent data change is introduced, so rollback requires no data migration or receipt cleanup. Preserve unrelated working-tree changes.

If compatibility problems are found, prefer a forward fix that preserves non-blank-secret enforcement, explicit HS256, normal time validation, verified-only claims, and route binding. Do not recover by restoring unsigned verification, trimming or accepting ambiguous transports, trusting body claims, or bypassing the service verifier. A rejected request is expected to have reached no downstream mutation, so rollback must not delete files, rewrite versions, or perform cleanup unrelated to this slice.

## Changed-line forecast and delivery gate

The forecast counts additions plus deletions in implementation and focused test files only; `design.md` and unrelated working-tree changes are excluded.

| Work area | Forecast |
|---|---:|
| Controller implementation | 10–20 |
| Service implementation | 45–75 |
| Controller regressions | 25–40 |
| Service regressions | 55–85 |
| **Total** | **135–220** |

The implementation should use parameterized cases and existing fixtures to remain within the forecast. Count concrete additions plus deletions before optional tests. If the diff reaches 400 changed lines, pause and request the configured `ask-on-risk` delivery decision; do not select a chain strategy or infer `size:exception`.

## Implementation sequence and verification boundary

1. Add the shared secret guard, strict transport extractor, verifier, claim normalizer, and route checks.
2. Replace controller-owned file JWT verification with service delegation and guard missing latest versions.
3. Normalize callback output at the controller boundary without changing callback status behavior.
4. Add the focused controller/service regressions in parameterized batches, recording task-level RED, GREEN, TRIANGULATE, and SAFETY-NET evidence during implementation.
5. Count the concrete diff before optional cases and stop at the 400-line gate.

This design phase performs no source/test edits and runs no tests. The next phase may implement only the four listed files and must preserve all exclusions above.
