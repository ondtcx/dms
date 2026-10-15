# Design: Close OnlyOffice Authentication Evidence Gaps

## Decision

Implement a test-only successor in the two existing OnlyOffice specs. Reuse the current JWT, `fs`, fetch, Prisma, and storage mocks; do not alter production code, configuration, schema, dependencies, or unrelated artifacts. The successor forecast is 84 changed lines (strictly below 100); stop and request `ask-on-risk` at 100 or if the forecast is threatened.

## Test fixtures and data flow

1. Service fixtures use secret `' onlyoffice-secret '` (verification expects `secret.trim()`), route claims `{ status: 1, key: 'doc_42_save_1' }`, and an upstream URL `https://onlyoffice.test` for status-2 cases.
2. The service fixture exposes resettable mocks for `fetch`, `prisma.document.findUnique`, `prisma.$transaction`, `documentVersion.create`, `documentAccess.create`, `document.update`, `storage.getPaths`, `generateStructuredPath`, `moveFile`, `deleteFile`, `calculateFileHash`, and mocked `fs.writeFileSync`.
3. Each rejected-case setup calls `jest.clearAllMocks()` and uses a fresh service/config fixture. A shared assertion requires `{ error: 1 }`, zero `fetch`, transaction, filesystem, storage, version, access, and update calls, and zero document lookup except where the case explicitly permits lookup.
4. The service path is asserted in order: transport extraction/JWT verification, claim validation, optional document lookup, then fetch/storage/transaction. No rejected case may observe a later stage.

## Service-spec changes (`src/onlyoffice/onlyoffice.service.spec.ts`)

- Replace the false-positive “mismatched dual” row with two tokens signed using the same trimmed secret and identical route claims plus distinct `jti` values (`header-token` and `body-token`). Assert both tokens are unequal and independently verifiable as HS256 credentials, pass header token A and body token B, assert `{ error: 1 }`, assert mocked `jwt.verify` is not called by the service, and assert all downstream mocks remain untouched. Retain matching dual transport with one shared token and `{ error: 0 }`.
- Add a parameterized verified-result matrix for primitive, array, and `{ payload: [] }` verifier results; signed unsupported status, route key mismatch, document mismatch, and status-2-without-identity claims; and a valid signed token whose body status disagrees. Assert the safe failure plus the shared no-mutation contract; body disagreement may verify once but must not reach Prisma.
- Add a `verifyFileToken` matrix for malformed, expired, unsigned, HS384, and wrong-document tokens, plus a blank-secret case. Assert `null`; for blank secret also assert `jwt.verify` is untouched. The controller matrix below proves these failures stop before Prisma.

## Controller-spec changes (`src/onlyoffice/onlyoffice.controller.spec.ts`)

- Parameterize invalid file-token delegation with the same six labels/tokens, mock `verifyFileToken` to return `null`, and assert `UnauthorizedException`, exact verifier arguments, and `prisma.document.findUnique` not called for every row.
- Parameterize three latest-version states: `null` document, `{ id: 42, versions: undefined }`, and `{ id: 42, versions: [] }`. Use a valid verifier result, permit exactly the existing document lookup, assert `NotFoundException('Documento no encontrado')`, and assert `fs.createReadStream` and response headers/path dereference are not called. Reset fs and Prisma mocks per row.
- Keep the existing valid stream fixture and assert the latest path, content type, and response headers, providing the positive safety comparison.

## Task-level TDD evidence

Apply must update `openspec/changes/onlyoffice-auth-regressions-final-backend/apply-progress.md` with this exact three-row `TDD Cycle Evidence` table; captured output, not predictions, fills result cells:

| Task / named cases | RED: first focused failure | GREEN: exact command and captured result | TRIANGULATE observation | SAFETY-NET: independent command/result |
|---|---|---|---|---|
| Dual tokens: unequal valid header/body; matching control | Record first assertion and signal; unavailable history is a blocker | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="dual"` plus exit/result | Unequal `jti` tokens independently verify; mismatch skips service verifier/downstream; matching token succeeds | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` plus captured result |
| Rejected claims and invalid file tokens | Record first named zero-call/assertion failure | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="rejects|side effect|file-token"` plus exit/result | Matrix identifies verifier/delegation boundary and every applicable untouched mock | `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` plus captured result |
| Missing document/versions: null, absent, empty; valid stream | Record first stream/path assertion failure | `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts --testNamePattern="versions|stream"` plus exit/result | Lookup is allowed once; no path/stream for missing state; valid stream remains concrete | `npm test` plus captured result |

If any historical RED or independent result was not captured, record `unavailable` and retain the evidence blocker; never invent command output. Apply and verification may run commands, but this design phase runs none.

## Acceptance and rollout

Review only the two spec diffs and the SDD receipt, confirm no production files changed, measure additions plus deletions, then run the captured focused commands and independent safety net. No commit or production rollback is part of this successor.

skill_resolution: fallback-path
status: ready
