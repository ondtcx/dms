# Tasks: OnlyOffice Authentication Rejection Evidence Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 70–95 lines across two specs and the apply receipt |
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

- Apply-owned edits are limited to `src/onlyoffice/onlyoffice.controller.spec.ts`, `src/onlyoffice/onlyoffice.service.spec.ts`, and `openspec/changes/onlyoffice-auth-rejection-evidence-backend/apply-progress.md`; this `tasks.md` is the planning artifact. No production source, configuration, schema, dependency, generated file, or unrelated artifact may change.
- The successor delta is additions plus deletions across those two specs and `apply-progress.md`, and MUST remain strictly below 100 lines. If the forecast reaches 100 lines or the measured delta reaches 100, stop and request the configured `ask-on-risk` decision; do not infer an exception, chain strategy, or alternate delivery strategy.
- This plan authorizes no source edits, commits, or command execution during task authoring. Apply and verify own implementation and evidence capture.
- Historical RED evidence is explicitly `unavailable` when it was not captured previously. Do not reconstruct, infer, or fabricate it from current failures, green results, or test expectations.

## Ordered strict-TDD work units

### 1. RED: establish the evidence boundary without rewriting history

- [x] In `src/onlyoffice/onlyoffice.controller.spec.ts` and `src/onlyoffice/onlyoffice.service.spec.ts`, identify the named failing or missing assertions from the prior evidence and preserve historical RED as `unavailable`; capture a new RED result only if it is actually observed before the corresponding test change, without claiming unavailable history as captured output. <!-- sdd-owner: implementation -->

### 2. GREEN: repair controller invalid-token invocation

- [x] In `src/onlyoffice/onlyoffice.controller.spec.ts`, change only the invalid-token matrix invocation from `'token'` to `` `invalid-${label}` ``; retain `jest.clearAllMocks()`, the verifier-call assertion, safe rejection message, and `findUnique` zero-call assertion for malformed, expired, unsigned, wrong-algorithm, wrong-document, and missing-secret rows. <!-- sdd-owner: implementation -->

### 3. GREEN: add service rejected-path no-downstream evidence

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, extend only the existing authentication fixture with resettable mocks for fetch, filesystem write, storage/path methods, document lookup, `$transaction`, transaction version/audit/update/access collaborators, and applicable document-version access; add one local helper and use fresh service state plus `jest.clearAllMocks()` per rejected transport, secret, JWT, claim, and body-disagreement case to assert `{ error: 1 }` and every applicable collaborator remains untouched. <!-- sdd-owner: implementation -->

### 4. GREEN: prove invalid file tokens stop before Prisma

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, add a parameterized `verifyFileToken(token, 42)` matrix for malformed, expired HS256, unsigned `alg:none`, HS384, wrong-route, and missing-secret values (`undefined`, `''`, and `'   '`); assert `null`, zero document/version lookup, zero `$transaction`, and zero transaction persistence/update/audit calls, without adding a nonexistent direct document-version lookup or covering missing-document/version behavior. <!-- sdd-owner: implementation -->

### 5. TRIANGULATE: verify observable boundaries and scope

- [x] In the two specified specs, confirm each matrix row exercises the intended verifier boundary and that no-downstream assertions cover only collaborators applicable to that path; inspect the diff to confirm no production or unrelated file changed and measure additions plus deletions before proceeding. <!-- sdd-owner: implementation -->

### 6. REFACTOR: keep the successor minimal and receipt-backed

- [x] In `openspec/changes/onlyoffice-auth-rejection-evidence-backend/apply-progress.md`, record only evidence captured during apply/verification, with task-level rows for controller alignment, service rejection, and invalid file-token persistence proof; retain historical RED as `unavailable` where applicable, record exact commands and results, and keep the measured successor below 100 changed lines. <!-- sdd-owner: implementation -->

## Verification commands (apply/verify only)

| Evidence | Command | Purpose |
|---|---|---|
| Controller focus | `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` | Verify all controller rejection rows and existing stream controls. |
| Service focus | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` | Verify rejected-path and invalid-file-token evidence. |
| Independent safety net | `npm test` | Verify the complete Jest unit suite. |
| Build safety | `npm run build` | Confirm the test-only changes type-check and build. |
| Scoped style check | `npx eslint src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts --no-fix` | Check only the two edited specs; do not run `npm run lint`. |

Verification must stop on a failing test, production-file diff, unavailable evidence being overstated, or a measured delta of 100 lines or more. Rollback is limited to successor assertions, fixtures, and receipt rows; preserve prior reports and unrelated working-tree changes.
