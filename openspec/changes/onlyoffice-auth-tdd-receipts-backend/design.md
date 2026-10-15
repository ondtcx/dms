# Design: Capture OnlyOffice Route-Mismatch TDD Receipts

## Decision

Add one focused regression to `src/onlyoffice/onlyoffice.service.spec.ts`; do not change
production code or any other source. Reuse the existing authentication-regression fixture and
its shared downstream assertion rather than creating a second service double.

## Exact fixture and route-mismatch case

- Use `secret = ' onlyoffice-secret '` and the existing `createService()` factory. It exposes
  `config`, `prisma`, `storage`, `tx`, and `fetchMock`, while the file-level `fs` mock exposes
  `fs.writeFileSync`.
- Sign the callback with `jwt.sign({ ...claims, key: 'doc_7_save_1' }, secret.trim(), {
  algorithm: 'HS256',
})`, where the existing `claims` value supplies `status: 1`. Invoke
  `context.service.handleCallback(42, { token })`. The signature is valid; `doc_7` is the
  route identity mismatch, not an authentication failure.
- Keep `expectNoDownstreamWork(context)` as the GREEN boundary. It already asserts zero calls
  for fetch, `fs.writeFileSync`, `prisma.document.findUnique`, `prisma.$transaction`, every
  storage/path/move/delete/hash mock, `tx.$queryRawUnsafe`, and every exposed nested
  transaction delegate (`onlyofficeCallbackReceipt`, document/user lookup, version, update,
  and access mocks).

## Strict-TDD receipt sequence

1. Construct the service fixture and signed token, then call `jest.clearAllMocks()` immediately
   after fixture construction. Do not use malformed, unsigned, or untrimmed-secret input.
2. Isolate the new test and add only the first route-mismatch response assertion. Capture its
   actual failing assertion and output as the phase-owned RED receipt before adding the final
   safety assertions or recording GREEN. Never reuse the existing parameterized row as RED
   evidence and never reconstruct unavailable output.
3. After RED, add the final response assertion, exactly
   `resolves.toEqual({ error: 1 })`, followed immediately by `expectNoDownstreamWork(context)`.
   Call `jest.clearAllMocks()` again immediately before `handleCallback` so the GREEN call
   counts belong only to this invocation.
4. Record GREEN only after the focused case passes. RED and GREEN receipts belong only in the
   change's phase-owned OpenSpec receipt; no production behavior or receipt history is inferred.

The current service already appears to reject this route key before downstream work. If the
fresh response assertion is green before any test-only correction, the apply phase must report
the RED gate as unavailable rather than manufacture a failure or use a deliberately false
expectation; this design phase records no test result.

## Data flow and contracts

The valid HS256 token is verified with `secret.trim()`, then fails the callback route-key
binding for route `42`. The service returns exactly `{ error: 1 }` before URL parsing, Prisma
lookup, fetch, filesystem writes, storage operations, hashing, or transaction entry. No
controller, configuration, schema, generated, or production service contract changes.

## Scope, evidence, and forecast

Allowed implementation surfaces are `src/onlyoffice/onlyoffice.service.spec.ts` and, if needed,
its phase-owned `apply-progress.md` receipt. The receipt must contain only apply-owned RED and
GREEN observations. No commands are run in this design phase and no commit is made.

Forecast: 25–45 additions plus deletions across the focused service spec and receipt, strictly
below 60 changed lines. At 60 or more, stop and request the configured `ask-on-risk` decision;
do not infer an exception or chain strategy. Rollback removes only the focused regression and
its phase-owned receipt.

status: ready
artifacts:
  design: openspec/changes/onlyoffice-auth-tdd-receipts-backend/design.md
next_recommended: tasks
skill_resolution: fallback-path
