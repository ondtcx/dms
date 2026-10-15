# Design: Repair OnlyOffice Rejection Evidence

## Decision

Implement a test-and-evidence-only successor in the two existing OnlyOffice specs. Production files, configuration, schema, dependencies, and unrelated artifacts remain unchanged. The successor stops before 100 changed lines; at 100, work pauses for the configured `ask-on-risk` decision.

## Exact existing fixtures and assertions

### Controller invalid-token matrix

- In `src/onlyoffice/onlyoffice.controller.spec.ts`, retain the existing `getFile` `it.each` labels: `malformed`, `expired`, `unsigned`, `wrong-algorithm`, `wrong-document`, and `missing-secret`.
- Keep `service.verifyFileToken` as `jest.fn().mockReturnValue(null)`, the third constructor dependency as `{ document: { findUnique } }`, and `jest.clearAllMocks()` at the start of each row.
- Change only the invocation token from the literal `'token'` to `` `invalid-${label}` ``.
- Preserve these exact boundary assertions for every row: rejection with `'Token inválido o expirado'`, `verifyFileToken` called with `` `invalid-${label}` `` and `42`, and `findUnique` not called.

### Service rejected-path fixture

- Extend the existing `createService` fixture in `src/onlyoffice/onlyoffice.service.spec.ts`; keep `secret = ' onlyoffice-secret '` and `claims = { status: 1, key: 'doc_42_save_1' }`.
- Replace its minimal Prisma double with resettable mocks for `document.findUnique`, `$transaction`, and the transaction collaborators actually used by the service: receipt create, raw lock query, transaction document/user lookup, `documentVersion.create`, `document.update`, and `documentAccess.create`.
- Return resettable storage mocks for `getPaths`, `generateStructuredPath`, `moveFile`, `deleteFile`, and `calculateFileHash`; use the existing mocked `fs.writeFileSync` and a per-case `global.fetch` mock. `fs.createReadStream` is a controller-only observable and is not asserted for service paths.
- Add one local no-downstream-work assertion helper. After each rejected transport, secret, JWT, claim, or body-disagreement case, assert `{ error: 1 }`, then zero calls to fetch, `fs.writeFileSync`, storage/path methods, Prisma document lookup, `$transaction`, and all transaction version/audit/update collaborators.
- Reset with `jest.clearAllMocks()` before each rejected case and use a fresh `createService` result; for missing-secret cases also clear and assert the existing mocked `jwt.verify` was not called.

### Invalid file-token Prisma proof

- Add a parameterized service matrix using the existing JWT mock and signing style: malformed `not.a.jwt`, expired HS256, unsigned `alg: none`, HS384, and a valid HS256 token signed for document `7` while verifying route `42`.
- Add missing-secret rows using `undefined`, `''`, and `'   '` configuration values. Each row calls `service.verifyFileToken(token, 42)`, expects `null`, and applies the same no-downstream-work helper.
- The explicit persistence proof is `prisma.document.findUnique` not called and `prisma.$transaction` not called; transaction version, audit, and update mocks must also remain at zero. Do not invent a direct `prisma.documentVersion` lookup that the current service does not expose.

## Data flow and contracts

Invalid controller input stops at `verifyFileToken` before document lookup. Invalid service callback transport or verified claims stop before fetch, filesystem, storage, document lookup, or transaction. Invalid file tokens return `null`; rejected callbacks retain `{ error: 1 }`. No production behavior is changed.

## Evidence and rollout

Historical RED evidence from the prior phase is unavailable, as recorded by `onlyoffice-auth-regressions-final-backend/verify-report.md`; preserve that exact status. Any successor receipt may record only output captured during its own apply or verification phase, and must never reconstruct RED from current failures, green results, or inference. Review the two spec diffs and the receipt, measure additions plus deletions, and create no commit.

## Forecast

Forecast: 86 changed lines across the two specs and the successor evidence receipt, strictly below 100. The estimate uses the existing matrices, fixture, and one shared assertion helper; defer optional coverage if the bound is threatened.

status: ready
skill_resolution: fallback-path
