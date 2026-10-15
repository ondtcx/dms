# Tasks: OnlyOffice Secret Null Evidence Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 5 test lines; under 40 changed lines including any authorized artifact progress edits |
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

This is a narrow test/evidence-only successor. Authorized implementation and progress surfaces are:

- `src/onlyoffice/onlyoffice.service.spec.ts` — add exactly one focused regression test; do not modify the fixture or helper.
- `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md` — record apply status, GREEN results, exact commands/results, changed paths, line-budget review, and rollback notes.
- `openspec/changes/onlyoffice-secret-null-evidence-backend/tasks.md` — update task checkboxes and verification status only as work is completed.

No production source, controller, route, configuration, persistence, generated file, helper, or unrelated test may be edited. The implementation-and-regression delta MUST remain fewer than 40 changed lines. If the gate is reached, stop and preserve the configured `ask-on-risk` decision rather than expanding scope.

## Ordered GREEN-only work

### GREEN — direct null-secret service evidence

- [x] In `src/onlyoffice/onlyoffice.service.spec.ts`, inside `describe('OnlyofficeService authentication regressions')` and alongside the existing throwing-lookup regression, add exactly this one test using the existing fixture and helper without modification:

  ```ts
  it('fails closed when secret lookup returns null', () => {
    const context = createService(null);
    expect(context.service.verifyFileToken('token', 42)).toBeNull();
    expectNoDownstreamWork(context);
  });
  ```

  This is the sole GREEN implementation task: it must prove the concrete `null` result and zero calls to the established fetch, filesystem, storage, Prisma, and transaction collaborators. <!-- sdd-owner: implementation -->

### Evidence and verification

- [x] Do not fabricate, reconstruct, or claim RED evidence; record this case as GREEN-only and preserve historical RED as unavailable in `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md`. <!-- sdd-owner: implementation -->
- [x] Run the focused service suite and record its observed result in `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md`: `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts --runInBand`. <!-- sdd-owner: implementation -->
- [x] Run the full unit suite and record its observed result in `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md`: `npm test -- --runInBand`. <!-- sdd-owner: implementation -->
- [x] Run the backend build and record its observed result in `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md`: `npm run build`. <!-- sdd-owner: implementation -->
- [x] Run scoped ESLint without autofix on the changed service spec and record its observed result in `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md`: `npx eslint src/onlyoffice/onlyoffice.service.spec.ts --no-fix`; do not run or report `npm run lint`. <!-- sdd-owner: implementation -->
- [x] Review the final diff and update `openspec/changes/onlyoffice-secret-null-evidence-backend/apply-progress.md` and this file with observed status, exact changed paths, rollback as removal of the focused test, and confirmation that the delta is fewer than 40 changed lines; do not edit any out-of-scope path. <!-- sdd-owner: implementation -->

## Apply boundary

No RED phase is authorized or implied because `strict_tdd` is false and production behavior already passes the null-secret guard. No production source edit is authorized. Apply must implement only the single GREEN test above, then perform the listed verification and artifact updates.
