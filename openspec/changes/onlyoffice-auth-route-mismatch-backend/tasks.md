# Tasks: OnlyOffice Route-Mismatch Rejection Evidence

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 25–40 across two existing artifacts |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Scope and boundaries

Only these edit surfaces are authorized:

- `src/onlyoffice/onlyoffice.service.spec.ts`
- `openspec/changes/onlyoffice-auth-route-mismatch-backend/apply-progress.md`

This is a test/evidence-only successor. Do not edit production source, controller tests, configuration, schema, dependencies, generated files, or unrelated artifacts. Do not create a commit or execute commands during the tasks phase.

## Ordered implementation tasks

### RED — historical evidence boundary

- [x] Mark the historical RED result as exactly `unavailable` in `openspec/changes/onlyoffice-auth-route-mismatch-backend/apply-progress.md`; do not run, reconstruct, infer, or claim a prior failing result, and distinguish all later observations as successor evidence. <!-- sdd-owner: implementation -->

### GREEN — focused service regression

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, update only the existing `OnlyofficeService authentication regressions` route-mismatch case: reuse `createService()`, retain the valid HS256 token signed with `secret.trim()` and claims `{ status: 1, key: 'doc_7_save_1' }`, invoke route document `42`, call `jest.clearAllMocks()` immediately before `handleCallback`, retain `{ error: 1 }`, and call the scoped no-downstream-work helper. <!-- sdd-owner: implementation -->

- [x] In the same service spec, extend the existing scoped helper to assert zero calls for `fetchMock`, `fs.writeFileSync`, `prisma.document.findUnique`, `prisma.$transaction`, every storage/path/move/delete/hash collaborator, `tx.$queryRawUnsafe`, and each exposed transaction delegate (`onlyofficeCallbackReceipt.create`, transaction document/user lookups, `documentVersion.create`, `document.update`, and `documentAccess.create`); remove only the duplicate empty-dependency route-mismatch case described by `design.md`. <!-- sdd-owner: implementation -->

### TRIANGULATE — receipt and verification

- [x] Record in `openspec/changes/onlyoffice-auth-route-mismatch-backend/apply-progress.md` only captured apply and verification observations, while keeping RED exactly `unavailable` and labeling GREEN, TRIANGULATE, and SAFETY-NET evidence as successor observations. <!-- sdd-owner: implementation -->

- [x] Verify the focused regression with `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts`, then run the complete unit suite with `npm test` and compile with `npm run build`; do not run `npm run lint`. <!-- sdd-owner: implementation -->

- [x] Review the diff and changed-file list to confirm only the two authorized edit surfaces changed, and measure additions plus deletions across them; proceed only when the total is strictly below 60 lines. <!-- sdd-owner: implementation -->

### REFACTOR — bounded cleanup

- [x] If the focused test or receipt needs cleanup after passing verification, make only behavior-preserving edits within the two authorized surfaces, rerun the focused test and line-count gate, and stop for an explicit `ask-on-risk` decision if the forecast or measured delta reaches 60 lines. <!-- sdd-owner: implementation -->

## Hard gates and rollback

- A measured or forecast delta of 60 or more changed lines is a hard stop: ask for the configured `ask-on-risk` decision. Do not infer `size:exception`, a chain strategy, or any production change.
- Rollback is limited to the successor assertions, fixture wiring, duplicate-case removal, and evidence rows in the two authorized files; preserve prior artifacts and the explicit unavailable-RED statement.
- Completion requires the validly signed document-7 token to fail route-42 authorization with `{ error: 1 }`, every applicable downstream collaborator to have zero calls, historical RED to remain unavailable, and the hard line gate to pass.
