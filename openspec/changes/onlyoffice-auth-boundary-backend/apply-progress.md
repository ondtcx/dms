# Apply Progress: OnlyOffice Authentication Boundary Backend

## Structured status

Consumed native `gentle-ai.sdd-status` v2 for `onlyoffice-auth-boundary-backend`: `applyState=ready`, `nextRecommended=apply`, action context `repo-local`, workspace rooted at `dms-backend`, with the four requested files inside the authoritative edit roots. No apply-progress artifact existed before this run. Runtime authority was the parent-provided active attempt; no new attempt was acquired and no commit was created.

## Completed tasks and persisted checkboxes

All 20 implementation-owned task rows in `tasks.md` are marked `- [x]`. The persisted task artifact was re-read after updating and confirmed complete.

- Work unit 1: strict raw header/body transport, configured-secret guard, shared HS256 verification, normal JWT time validation, and safe failures.
- Work unit 2: verified-only claim normalization, route/status/document binding, body disagreement rejection, status-2 signed identity requirements, and acknowledgement behavior.
- Work unit 3: service-owned file-token verification, generation secret guard, route binding, and missing document/latest-version guard.
- Work unit 4: raw callback forwarding and minimal `{ error: 0 | 1 }` HTTP response normalization.
- Work unit 5: scoped verification and four-file boundary review.

## TDD Cycle Evidence

| Work unit | RED | GREEN | TRIANGULATE | SAFETY-NET |
|---|---|---|---|---|
| 1 | Added focused transport, secret, and file-token regression cases; initial test iteration exposed an unspyable JWT namespace and was corrected without weakening assertions. | Implemented strict transport extraction and shared configured HS256 verifier. | Focused service tests pass for header/body transport, malformed transport, missing secret, and bound file token. | Service focused suite passed, including existing health and blank-document coverage. |
| 2 | Existing route-mismatch regression plus focused authenticated transport fixtures exercised the claim boundary. | Implemented plain-object normalization, integer route binding, and body/claim comparisons. | Route mismatch remains rejected before downstream access; non-status-2 authenticated acknowledgement remains `{ error: 0 }`. | Service focused suite passed. |
| 3 | Added controller delegation/null-verifier and absent-version regressions plus generation-secret cases. | Delegated file verification and guarded latest-version dereference. | Controller tests prove invalid tokens stop before Prisma and absent versions fail generically. | Both focused suites passed. |
| 4 | Added exact minimal response tests for extra result properties and thrown service errors. | Normalized callback results and exception responses while forwarding raw values. | Controller tests confirm only `{ error: 0 }` or `{ error: 1 }` is emitted. | Controller focused suite passed. |
| 5 | Measured scoped implementation/test edits and reviewed changed paths against the four-file boundary. | Retained only focused authentication regressions. | Unrelated pre-existing working-tree changes were not edited. | Full suite, build, and scoped ESLint passed. |

## Files changed by this apply

- `src/onlyoffice/onlyoffice.service.ts`
- `src/onlyoffice/onlyoffice.controller.ts`
- `src/onlyoffice/onlyoffice.service.spec.ts`
- `src/onlyoffice/onlyoffice.controller.spec.ts`

The repository already contained unrelated pending changes outside this list; they were preserved.

## Verification evidence

- `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` — passed, 20 tests.
- `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` — passed, 6 tests.
- `npm test` — passed, 30 suites and 192 tests.
- `npm run build` — passed.
- `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts --no-fix` — passed.
- `npm run lint` was intentionally not run because it auto-fixes unrelated files.

## Deviations and exclusions

No schema, migration, dependency, module, upstream redirect/content/MIME/stream validation, cleanup, orphan, persistence, or broad concurrency work was added. Existing downstream callback flow remains otherwise unchanged.

## Workload / PR boundary

This is the first stacked slice targeting `main`; the later change owns upstream and cleanup concerns. The requested four-file implementation/test boundary remained substantially below the 400-line review gate when considering the authored authentication changes; unrelated pre-existing working-tree diffs were excluded from the workload measurement. No chain or size exception was selected.

## Remaining tasks

None. All implementation-owned checkbox rows are complete. Next recommended phase: `sdd-verify`.
