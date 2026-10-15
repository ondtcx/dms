# Tasks: OnlyOffice Authentication Regression Evidence

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 60–95 successor lines; design forecast 84 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Scope and hard gates

- Apply may edit exactly these two test-spec files: `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts`; the phase-owned receipt `openspec/changes/onlyoffice-auth-regressions-final-backend/apply-progress.md` may record evidence only. No production source, configuration, schema, dependency, generated file, or unrelated artifact is in scope.
- Count additions plus deletions across the successor test/evidence delta before apply completion. The hard gate is strictly fewer than 100 changed lines; at 100 lines or when the bound is threatened, stop and request the configured `ask-on-risk` decision. Do not infer `size:exception`, chaining, or another delivery strategy.
- This phase runs no commands and edits no source or test files. Apply owns implementation and captured evidence; unavailable historical evidence remains `unavailable` and a blocker rather than being reconstructed.

## Ordered strict-TDD work units

### 1. RED/GREEN: distinguish valid mismatched dual tokens

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, replace the false-positive mismatch fixture with two unequal, independently signed HS256 tokens using the trimmed configured secret, valid route claims, and distinct `jti` values; assert both independently verify, send header token A/body token B, retain the equal-token acceptance control, and assert `{ error: 1 }` plus untouched downstream mocks. Capture the first named RED assertion before the fix, then the exact GREEN result from `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="dual"`; TRIANGULATE that disagreement—not claim invalidity—causes rejection and the service verifier/downstream boundary is skipped; record independent SAFETY-NET output from `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts`. <!-- sdd-owner: implementation -->

### 2. RED/GREEN: prove rejected service and file-token paths are side-effect free

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, add resettable parameterized cases for primitive/array/malformed verified envelopes, route/body disagreement, unsupported status, route/document mismatch, missing status-2 identity, malformed/expired/unsigned/wrong-algorithm/wrong-document file tokens, and blank secret; assert `{ error: 1 }` or `null`, verifier/delegation ordering, and every applicable zero-call observation for `fetch`, Prisma document/version/access calls, transactions, filesystem/path access, streams, storage moves, audits, and updates, with invalid file tokens stopping before Prisma. Capture the first named RED zero-call failure, then GREEN with `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="rejects|side effect|file-token"`; TRIANGULATE each matrix boundary and applicable untouched mock; record controller-spec SAFETY-NET output from `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts`. <!-- sdd-owner: implementation -->

### 3. RED/GREEN: protect missing-document/version stream boundaries

- [x] In `src/onlyoffice/onlyoffice.controller.spec.ts`, parameterize `null` document, `versions: undefined`, and `versions: []` using the valid verifier result; permit only the document lookup, assert `NotFoundException('Documento no encontrado')`, and assert no path dereference, response header/path access, or `fs.createReadStream`; reset mocks per case and retain the valid latest-version stream control. Capture the first named stream/path RED failure, then GREEN with `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts --testNamePattern="versions|stream"`; TRIANGULATE the allowed lookup versus forbidden dereference and valid-stream comparison; record the independent full-suite SAFETY-NET from `npm test`. <!-- sdd-owner: implementation -->

### 4. TRIANGULATE/SAFETY-NET: receipt and bounded delivery check

- [x] In `openspec/changes/onlyoffice-auth-regressions-final-backend/apply-progress.md`, record exactly three task-level `TDD Cycle Evidence` rows for the preceding work units, each naming cases and captured RED failure, exact GREEN command/result, TRIANGULATE observation, and independent SAFETY-NET command/result; preserve `unavailable` or failures as blockers and do not claim uncaptured output. Verify only the two spec diffs and receipt, measure the under-100-line delta, run `npx eslint src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts` as scoped ESLint (without `npm run lint`), and run `npm run build`; stop on any hard-gate breach or production-file change. <!-- sdd-owner: implementation -->

## Required command matrix (apply/verify only)

| Evidence stage | Command | Required use |
|---|---|---|
| Focused dual-token | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="dual"` | GREEN result for work unit 1 |
| Focused service rejection | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="rejects|side effect|file-token"` | GREEN result for work unit 2 |
| Focused controller safety | `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts --testNamePattern="versions|stream"` | GREEN result for work unit 3 |
| Full suite | `npm test` | Independent safety net |
| Build | `npm run build` | Type/build safety check |
| Scoped ESLint | `npx eslint src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts` | Test-only style check; do not run `npm run lint` |

## Rollback and completion boundary

Revert only the successor assertions/fixtures and its evidence rows if necessary. Preserve prior reports, production changes, unrelated working-tree state, and runtime/database state. Completion requires no production edits, no commit, all applicable evidence captured or explicitly blocked, and a measured delta below 100 changed lines.
