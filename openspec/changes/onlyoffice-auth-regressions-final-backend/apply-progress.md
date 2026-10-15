# Apply Progress

Change: `onlyoffice-auth-regressions-final-backend`

## Status

- Native status consumed: `gentle-ai.sdd-status` v2, apply `ready`, action context `repo-local`.
- Runtime attempt acquired and continued with request `apply-final-auth-evidence-001`; token retained by parent runtime.
- Test/evidence-only scope preserved; no production source or commit changed.
- Measured successor work remained below the 100-line runtime budget; pre-existing working-tree changes were not treated as successor edits.

## Completed tasks and persisted checkboxes

- Task 1 completed and marked `[x]`: dual transport now uses unequal signed tokens with independently valid claims and retains matching control.
- Task 2 completed and marked `[x]`: rejected file-token cases cover named invalid-token classes and assert controller Prisma lookup is untouched; rejected claim matrix remains safe-failure coverage.
- Task 3 completed and marked `[x]`: controller covers null, absent, and empty versions and asserts no stream creation; valid stream control remains.
- Task 4 completed and marked `[x]`: this receipt records task-level evidence and bounded verification.

## TDD Cycle Evidence

| Task / named cases | RED: first focused failure | GREEN: exact command and captured result | TRIANGULATE observation | SAFETY-NET: independent command/result |
|---|---|---|---|---|
| Dual tokens: unequal valid header/body; matching control | unavailable: no pre-apply failing assertion was captured; historical RED remains a blocker | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="dual"` — PASS, 2 passed, 38 skipped | Unequal HS256 tokens use distinct `jti` values and the mismatch transport returns `{ error: 1 }`; matching dual remains passing. | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` — PASS, 40 passed. |
| Rejected claims and invalid file tokens | unavailable: no pre-apply failing zero-call assertion was captured; historical RED remains a blocker | `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --testNamePattern="rejects|side effect|file-token"` — PASS, 21 passed, 19 skipped | Named invalid file-token cases delegate to verification and the controller asserts Prisma is not called; invalid claim cases return `{ error: 1 }`. | `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` — PASS, 13 passed. |
| Missing document/versions: null, absent, empty; valid stream | unavailable: no pre-apply failing stream/path assertion was captured; historical RED remains a blocker | `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts --testNamePattern="versions|stream"` — PASS, 4 passed, 9 skipped. | Null document, undefined versions, and empty versions reject before `createReadStream`; valid latest version still streams. | `npm test` — PASS, 30 suites and 219 tests passed; Jest reported one worker forced exit after suites completed. |

## Files changed

- `src/onlyoffice/onlyoffice.service.spec.ts`
- `src/onlyoffice/onlyoffice.controller.spec.ts`
- `openspec/changes/onlyoffice-auth-regressions-final-backend/tasks.md`
- `openspec/changes/onlyoffice-auth-regressions-final-backend/apply-progress.md`

## Verification

- `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` — PASS.
- `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` — PASS.
- `npm test` — PASS.
- `npm run build` — PASS.
- `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts --no-fix` — PASS.
- `npm run lint` was not run.

## Deviations and remaining work

- Historical RED evidence was unavailable and is explicitly retained as a blocker rather than fabricated.
- No unchecked implementation tasks remain; final independent SDD verification is next.
- Runtime attempt settlement remains parent/orchestrator responsibility.
