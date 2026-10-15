# Apply Progress: OnlyOffice Secret Lookup Fail-Closed Backend

## Status consumed

Consumed native `gentle-ai.sdd-status` v2 for `onlyoffice-secret-lookup-fail-closed-backend`: `applyState: ready`, `nextRecommended: apply`, repository-local workspace, and authoritative allowed edit root is the backend repository. Runtime attempt continued with request `apply-secret-fail-closed-001`, token `sha256:efdb652dd22063fb140897aabb7fb2b07d35cb25c62fddf639fcb07936010e02`, max attempts 1, max changed lines 60, and supplied untracked inventory.

## RED — observed before production edits

- Added the focused throwing-getter regression to `src/onlyoffice/onlyoffice.service.spec.ts` using the existing `createService` fixture.
- Exact command: `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --runInBand`
- Result: **RED / failed as required**. Jest reported `1 failed, 47 passed`; the new test failed because `Error: secret lookup failed` escaped from `OnlyofficeService.verifyToken` at `src/onlyoffice/onlyoffice.service.ts:416:32`, rather than resolving to `null`.
- This RED was recorded before any production edit; no RED evidence was fabricated.
- Persisted task update: the service RED task is marked `- [x]` in `tasks.md`.

## GREEN — minimal production fix

- Moved the existing `ONLYOFFICE_SECRET` lookup and its existing type/blank/token guard inside the existing `verifyToken` `try/catch` in `src/onlyoffice/onlyoffice.service.ts`. No controller production code was changed.
- Exact command: `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --runInBand`
- Result: **GREEN / passed**, 1 suite and 48 tests passed.
- Exact command: `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts --runInBand`
- Result: **GREEN / passed**, 1 suite and 13 tests passed. The existing controller invalid-token coverage remains passing; no new controller regression was added because the user explicitly restricted allowed edits to the service, service spec, tasks, and apply-progress files.

## TRIANGULATE / safety net

- Exact command: `npm test -- --runInBand`
- Result: **passed**, 30 suites and 227 tests passed. Expected test logs include existing thumbnail/document-generator error and warning cases; the suite still passed.
- Exact command: `npm run build`
- Result: **passed**.
- Exact command: `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.service.spec.ts --no-fix`
- Result: **passed** with no output.
- The direct regression asserts `null` and reuses `expectNoDownstreamWork(context)`, proving no fetch, filesystem write, Prisma document lookup/transaction, storage, or transaction collaborator work.

## Scope and size review

- Authored change surfaces: `src/onlyoffice/onlyoffice.service.ts`, `src/onlyoffice/onlyoffice.service.spec.ts`, this `tasks.md`, and this `apply-progress.md` only.
- `src/onlyoffice/onlyoffice.controller.spec.ts` was intentionally not edited because it is outside the user's explicit allowed edit list, despite the pre-existing task/design request for a route regression.
- The authored implementation/regression delta is small (approximately 24 changed lines including the minimal guard movement and focused test), well below the 60-line hard gate. Existing unrelated working-tree changes were not edited or counted as authored work.
- Rollback: revert the service guard movement and direct regression together; no controller, Prisma, configuration, generated-output, or unrelated-file rollback is required.

## Completed tasks

Persisted `tasks.md` checkboxes now mark complete: service RED, minimal service fix, direct GREEN assertions, narrowness review, size/scope review, verification commands, and apply-progress receipt.

## Remaining tasks

- [ ] In `src/onlyoffice/onlyoffice.controller.spec.ts`, add the focused route regression; this is blocked by the user's explicit allowed-edit list and was not attempted.
- [ ] In `src/onlyoffice/onlyoffice.controller.spec.ts`, complete the GREEN route assertions; this is blocked by the user's explicit allowed-edit list and was not attempted.

## Delivery boundary

Single cohesive service work unit. No commit was created. Because two implementation-owned controller-spec tasks remain unchecked by explicit scope restriction, final implementation completion / `sdd-verify` readiness is not claimed.
