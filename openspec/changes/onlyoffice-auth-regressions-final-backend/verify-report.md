```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:708616d901f90946b20318cfa7ed80bfb318d9b7c2d371590a3cf20e03273aea
verdict: fail
blockers: 3
critical_findings: 3
requirements: 2/5
scenarios: 4/9
test_command: npm test
test_exit_code: 1
test_output_hash: sha256:75d54745d864cdad239f9050860d0a87b86a5fba3c3f9f862627161c46b44964
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:d7bc0c341cd312128d2ff7248069ff1093190d163bc0f01fa4a7e7dcd407b434
```

## Verification status

**FAIL — 3 critical blockers.** The service-only test and build pass, but the controller-only test and full suite fail. The implementation is not ready for archive. No source/test edits or commit were made during verification.

## Spec coverage

The retrieved specification contains 5 requirements and 9 scenarios. Two requirements and four scenarios are complete:

| Requirement | Result | Evidence |
|---|---|---|
| Distinguish mismatched dual tokens with valid credentials | PASS | The mismatch transport uses unequal tokens: a valid HS256 body token and a valid HS256 header token with the same trimmed secret and valid route claims. The matching-dual control remains present, and a separate test verifies unequal independently valid tokens. |
| Prove rejected paths have no applicable mutation or downstream access | FAIL — CRITICAL | The service rejection matrix asserts only `{ error: 1 }`; it does not provide the required resettable fetch, Prisma, transaction, filesystem/path, stream, storage, audit, or update mocks/assertions. The invalid file-token matrix is not implemented in the service spec. The controller matrix contains a concrete Prisma no-call assertion, but each row fails before reaching it because the invocation passes `token` while the expectation requires `invalid-${label}`. |
| Reject missing documents and versions before stream dereference | PARTIAL | Null document, `versions: undefined`, and `versions: []` each reject and assert `fs.createReadStream` is untouched; the valid stream control passes. The design/task request for independently observable response-header/path non-access is not fully asserted. |
| Record task-level strict-TDD evidence | FAIL — CRITICAL | `apply-progress.md` contains the required `TDD Cycle Evidence` table with exactly three rows and exact focused GREEN/Safety-Net commands, but all three RED cells explicitly say `unavailable`; the artifact correctly retains this as a blocker. Current controller verification also invalidates its recorded passing safety-net result. |
| Enforce a hard under-100-line successor gate | PASS | The authoritative attempt status reports 71 lifetime changed lines against the explicit 100-line maximum, with no size exception or chain strategy inferred. |

Scenario coverage is 4/9: both dual-token scenarios pass; the rejected service-auth and invalid-file-token scenarios fail; missing-state stream safety is partial; valid latest-version streaming passes; task-level evidence is incomplete; the bounded-successor scenario passes. The threshold-stop scenario was not triggered.

## Task completion

All 4 implementation task markers in `openspec/changes/onlyoffice-auth-regressions-final-backend/tasks.md` are checked `[x]`; no unchecked implementation task lines matching `^\s*- \[ \]` remain. Checkbox completion does not override the three verification blockers or make archive ready.

## Structured status and actionContext

The authoritative native `gentle-ai.sdd-status` v2 selected `onlyoffice-auth-regressions-final-backend` unambiguously with state `ready`, OpenSpec storage, and all apply/spec/design/task dependencies complete. Its `actionContext` is `repo-local`, rooted at `C:\Users\diego\projects\dms-fullstack\dms-backend`, with that repository as the allowed edit root; implementation ownership and target files are proven there. Archive remains blocked because the verify report was missing before this write.

The supplied runtime authority was acquired with request `verify-final-auth-evidence-001` and token `sha256:45c777e6528c6e499f47b7d488c6aeef2edd0be49986848c182953a88a393dd1`, then settled as failed at evidence revision `sha256:708616d901f90946b20318cfa7ed80bfb318d9b7c2d371590a3cf20e03273aea`. The active verification attempt reported zero additional changed lines; its lifetime accounting remained 71 lines.

## Test and validation commands

The five requested commands were run exactly. `npm run lint` was not run.

| Command | Exit code | Result | Exact output hash |
|---|---:|---|---|
| `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` | 0 | PASS — 40 tests passed | `sha256:f7e7d0a5a9e89c3130d2d34b7bb160798b6478755354b6c40819168860d977f0` |
| `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` | 1 | FAIL — 6 failed, 7 passed; every invalid-token row expected `invalid-${label}` but received `token` | `sha256:654a8bb0e729738d0ccef0627a93b2f4a676f30a491601c6465adbb339e2555a` |
| `npm test` | 1 | FAIL — 6 failed, 213 passed across 30 suites; the same controller assertions fail | `sha256:75d54745d864cdad239f9050860d0a87b86a5fba3c3f9f862627161c46b44964` |
| `npm run build` | 0 | PASS | `sha256:d7bc0c341cd312128d2ff7248069ff1093190d163bc0f01fa4a7e7dcd407b434` |
| `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts --no-fix` | 0 | PASS | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Strict TDD compliance

Strict TDD is enabled by `openspec/config.yaml`. The required table exists at `apply-progress.md:19` and has one row for each of the three implementation regression tasks. The test files named by the rows exist. The exact focused GREEN commands are recorded in the receipt, but the receipt records no captured first RED failure for any row, which is a CRITICAL evidence failure rather than a historical fact that may be reconstructed. The service file's current full focused run is green; the controller file's current focused run is not green. The receipt's full-suite safety-net claim is stale against the current exact execution.

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | PASS | Required `TDD Cycle Evidence` table found with three rows. |
| All tasks have tests | PASS | 3/3 regression work units have existing test files. |
| RED confirmed | FAIL — CRITICAL | 0/3 rows provide a captured RED failure; all are explicitly `unavailable`. |
| GREEN confirmed | PARTIAL | Service evidence remains green; controller evidence fails independently now. |
| Triangulation adequate | PARTIAL | Named cases and observations are present, but required no-mutation observations are absent. |
| Safety net for modified files | PARTIAL | Service safety net passes; controller and full-suite safety nets fail now. |

**TDD Compliance**: 2/6 checks pass without qualification; missing RED history remains a blocker.

### Test layer distribution

| Layer | Tests | Files | Tools |
|---|---:|---:|---|
| Unit | 53 | 2 | Jest |
| Integration | 0 | 0 | Not used |
| E2E | 0 | 0 | Not used |
| **Total** | **53** | **2** | |

Both changed test files are unit tests using mocked dependencies. No integration or E2E coverage is present for these scenarios.

### Changed file coverage

Coverage analysis skipped — no coverage command was authorized or run.

## Assertion quality

No tautologies, ghost loops, smoke-only tests, or standalone type-only assertions were found. The valid stream `toBeDefined()` assertion is paired with concrete stream-path and content-type assertions. The controller's `findUnique.not.toHaveBeenCalled()` and missing-state `createReadStream.not.toHaveBeenCalled()` assertions are concrete and relevant, although the invalid-token test fails before its Prisma assertion executes.

The required no-mutation assertion quality is not satisfied: the service's rejected authentication cases have no concrete downstream zero-call assertions, and the test named `rejects missing secrets and never verifies` does not actually assert that `jwt.verify` was untouched. This is included in the CRITICAL rejected-path coverage blocker, not treated as a tautology.

## Approved edit surfaces and working tree

The proposal/tasks/design approve only the two existing test specs plus the phase-owned evidence receipt; production source, configuration, schema, dependencies, generated files, and unrelated working-tree files are excluded. No file was edited during verification and no commit was created. The working tree still shows pre-existing modifications to `.gitignore`, `prisma/schema.prisma`, `src/onlyoffice/onlyoffice.controller.ts`, `src/onlyoffice/onlyoffice.service.ts`, and `src/settings/settings.service.ts`, plus unrelated untracked artifacts; these were visible before runtime verification and were not attributed to this successor. The apply receipt also records `tasks.md` as an artifact update, while all implementation-owned task markers are complete. No production edit is owned by this verification attempt.

## Review workload and PR boundary

The task forecast is 60–95 changed lines and the design forecast is 84. The runtime attempt's authoritative lifetime measurement is 71/100 changed lines, so the strict successor budget is satisfied. The canonical 400-line budget is low risk; chained PRs were not recommended, `Chain strategy` remains pending, and no `size:exception` or alternate delivery strategy was inferred. The configured `ask-on-risk` boundary remains preserved.

## Exact blockers

1. `src/onlyoffice/onlyoffice.controller.spec.ts:142` fails in all six invalid-token rows because the test calls `controller.getFile(42, 'token', ...)` while expecting `verifyFileToken` to receive `invalid-${label}`; this causes the controller-focused test and full suite to exit 1.
2. The service rejection/file-token coverage lacks the required concrete resettable no-mutation and downstream zero-call assertions, including the explicit invalid-file-token-before-Prisma proof.
3. `apply-progress.md` records `unavailable` RED evidence for all three strict-TDD rows, so the required historical RED evidence remains an explicit CRITICAL blocker.

## Phase envelope

status: blocked
executive_summary: Verification failed: two requested test commands fail, concrete service no-mutation evidence is absent, and strict-TDD RED evidence remains unavailable.
artifacts: `openspec/changes/onlyoffice-auth-regressions-final-backend/verify-report.md`
next_recommended: remediate
risks:
- Archiving would preserve a failing controller regression matrix and unsupported no-mutation claims.
- The visible production-source changes are pre-existing and must remain outside this successor's remediation scope.
skill_resolution: fallback-path

## Key Learnings

1. A passing service suite does not establish concrete no-mutation evidence.
2. Current controller failures invalidate the previously recorded full-suite pass.
3. Strict-TDD receipts must preserve unavailable RED history as blockers.
