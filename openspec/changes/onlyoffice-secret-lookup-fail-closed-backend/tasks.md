# Tasks: OnlyOffice Secret Lookup Fail-Closed Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 16–24 implementation and direct-service regression lines; fewer than 60 required |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Scope and edit surfaces

Only the direct-service implementation and regression paths are in scope:

- `src/onlyoffice/onlyoffice.service.ts`
- `src/onlyoffice/onlyoffice.service.spec.ts`
- `openspec/changes/onlyoffice-secret-lookup-fail-closed-backend/apply-progress.md`
- `openspec/changes/onlyoffice-secret-lookup-fail-closed-backend/tasks.md`

The existing controller suite is a safety net only. Do not edit
`src/onlyoffice/onlyoffice.controller.ts` or
`src/onlyoffice/onlyoffice.controller.spec.ts`; do not change routes, configuration,
Prisma, generated output, file handling, or unrelated authentication behavior. The
authored implementation-and-regression diff must remain fewer than 60 changed lines;
reaching 60 pauses delivery for the configured `ask-on-risk` decision.

## Ordered direct-service strict-TDD tasks

### RED — fresh failure evidence

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, extend the existing `createService` fixture with a focused regression whose `config.get` throws a sentinel error, and capture the fresh pre-fix failure showing that `verifyFileToken` exposes the error instead of returning `null`. <!-- sdd-owner: implementation -->

### GREEN — minimal production fix

- [x] In `src/onlyoffice/onlyoffice.service.ts`, move only the existing `ONLYOFFICE_SECRET` lookup and its current type/blank guard inside `verifyToken`’s existing `try/catch`, preserving token checks, HS256 options, claim handling, and the `null` contract. <!-- sdd-owner: implementation -->
- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, assert that a throwing secret lookup resolves to `null` without exposing the sentinel error. <!-- sdd-owner: implementation -->

### TRIANGULATE — direct boundary and downstream proof

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, reuse `expectNoDownstreamWork(context)` for the throwing lookup case and verify that all existing service-level downstream collaborators receive zero calls. <!-- sdd-owner: implementation -->
- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, verify that a `null` secret result also resolves to `null` without adding unrelated authentication cases. <!-- sdd-owner: implementation -->

### REFACTOR — narrowness and safety net

- [x] Review `src/onlyoffice/onlyoffice.service.ts` and `src/onlyoffice/onlyoffice.service.spec.ts` against the existing OnlyOffice tests; retain unchanged valid and invalid authentication behavior and remove edits outside this secret-lookup failure boundary. <!-- sdd-owner: implementation -->
- [x] Run the existing `src/onlyoffice/onlyoffice.controller.spec.ts` suite as a safety net only; do not add or modify controller tests or controller production code. <!-- sdd-owner: implementation -->
- [x] Verify the authored implementation and direct-service regression remain below the hard 60 changed-line gate and touch no paths outside the declared service/artifact surfaces; pause instead of expanding scope if the gate is reached. <!-- sdd-owner: implementation -->

### Verification and receipt

- [x] Run and preserve these exact verification commands and results in `openspec/changes/onlyoffice-secret-lookup-fail-closed-backend/apply-progress.md`: `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --runInBand`, `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts --runInBand` (existing safety net only), `npm test -- --runInBand`, `npm run build`, and `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.service.spec.ts --no-fix`; exclude `npm run lint`. <!-- sdd-owner: implementation -->
- [x] Update `openspec/changes/onlyoffice-secret-lookup-fail-closed-backend/apply-progress.md` with RED-before-fix evidence, GREEN/direct no-downstream results, safety-net verification, exact changed paths, line-budget review, and rollback as a source revert; do not claim evidence that was not observed. <!-- sdd-owner: implementation -->
