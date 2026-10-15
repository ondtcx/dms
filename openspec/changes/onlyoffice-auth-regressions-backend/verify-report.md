```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a45c1bc678c31b410504ac306c68248f8c3803f44dc9c1c5b5a2bed8d3108dba
verdict: fail
blockers: 4
critical_findings: 4
requirements: 1/7
scenarios: 6/12
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:e80c033eb08ef3fab7866a7340416c470daee312c21d801b230c0bd74ba9d33e
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:d7bc0c341cd312128d2ff7248069ff1093190d163bc0f01fa4a7e7dcd407b434
```

## Verification status

**FAIL — 4 blockers.** All five requested commands pass, but the test/evidence slice does not prove the full specification. No production source or test file was edited during verification, and no commit was created.

## Spec coverage

The retrieved specification contains 7 requirements and 12 scenarios. One requirement and six scenarios are complete:

| Requirement | Result | Evidence finding |
|---|---|---|
| Authentication transport variants | FAIL | Header-only, body-only, and matching dual-token cases exist; the named mismatched-dual case uses the same generated token in both transports and rejects because the body `key` disagrees, so it does not prove token mismatch. Several non-string/header and malformed-body variants are absent. |
| JWT verification rejects invalid credentials and records algorithm enforcement | PASS | Missing/undefined/blank secret results, malformed/expired/not-before/unsigned/HS384 tokens, and the exact `{ algorithms: ['HS256'] }` verifier call are exercised. |
| Verified claims remain route- and status-bound | FAIL | Direct/nested valid claims and several mismatches exist, but primitive/array verified results, malformed payload envelopes, and separate signed status-2 URL/user-identity omissions are not covered. |
| File-token delegation and missing-state handling | FAIL | Basic delegation, route binding, generation-secret rejection, valid stream, unknown document, and empty-version safety exist; the required invalid file-token matrix and complete stream contract are not proven. |
| Callback responses are minimal and non-disclosing | FAIL | Minimal success/failure/exception bodies are checked, but the tests do not assert HTTP-200 metadata or the complete exact callback response contract. |
| Rejected paths prove no mutation or downstream access | FAIL | Service rejection tests assert `{ error: 1 }` but do not assert the required applicable fetch, Prisma, stream, file, version, audit, and document-update observations are unused. |
| Task-level strict-TDD evidence and review gate | FAIL | The line budget is met, but the receipt is not concrete task-level TDD evidence. |

Scenario results: supported token transports **PASS**; unsafe transport variants **FAIL**; invalid secret/token **PASS**; explicit algorithm guard **PASS**; valid verified claims **PASS**; claim/binding mismatch **FAIL**; valid file access **PASS**; invalid file state **FAIL**; callback result normalization **FAIL**; rejected-request no side effects **FAIL**; complete task-level evidence **FAIL**; review-budget gate **PASS**.

## Task completion

All 20 implementation task markers in `openspec/changes/onlyoffice-auth-regressions-backend/tasks.md` are checked `[x]`; no unchecked implementation task lines remain. Checkbox state does not override the missing coverage and evidence blockers above.

## Structured status and action context

The consumed authoritative `gentle-ai.sdd-status` v2 selected change `onlyoffice-auth-regressions-backend`, state `ready`, with `nextRecommended: verify`. Its `actionContext` was repo-local, rooted at `C:\Users\diego\projects\dms-fullstack\dms-backend`, and provided that root as the allowed edit root. Proposal, spec, design, tasks, and apply-progress were present and complete; verify-report was initially missing. Ownership and target files are proven for the candidate delta. The runtime attempt was acquired with the supplied token and settled as failed against this evidence revision.

## Test and validation commands

All required commands were run exactly; `npm run lint` was not run.

| Command | Result | Output hash |
|---|---:|---|
| `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` | 0 — 39 passed | `sha256:21cf1b920e9cee85fbb89073b4fbbf37f101fd3bffd4dc5373c2e74e9ef93447` |
| `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts` | 0 — 7 passed | `sha256:8a892fda9fd52da755c433681f82fd7701dff33b70529497eb8f1f10ae4ded62` |
| `npm test` | 0 — 30 suites, 212 tests passed | `sha256:e80c033eb08ef3fab7866a7340416c470daee312c21d801b230c0bd74ba9d33e` |
| `npm run build` | 0 — passed | `sha256:d7bc0c341cd312128d2ff7248069ff1093190d163bc0f01fa4a7e7dcd407b434` |
| `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts --no-fix` | 0 — passed | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Strict TDD compliance

Strict TDD is enabled in `openspec/config.yaml`. The required `TDD Cycle Evidence` table is **missing**. `apply-progress.md` instead has a `Task-level strict-TDD evidence` table with 20 marker rows, but 0/20 rows meet the full concrete evidence contract:

- RED entries generally state a gap or predecessor blocker, not the named first focused failure and failure signal for the case.
- GREEN entries frequently say a suite passed without the exact focused command; the claimed results are not independently attributable per marker.
- TRIANGULATE entries are aggregate prose and do not identify case-level verifier options, delegation, verified claim source, response shape, and applicable no-mutation observations.
- SAFETY-NET entries aggregate baseline counts and do not provide independently attributable per-marker evidence.

The two reported test files exist and their current suites are green. Historical RED and safety-net claims cannot be independently confirmed from the receipt. This is a **CRITICAL** strict-TDD evidence failure.

### Test layer distribution

| Layer | Tests | Files | Tools |
|---|---:|---:|---|
| Unit | 46 | 2 | Jest |
| Integration | 0 | 0 | Not used |
| E2E | 0 | 0 | Not used |
| **Total** | **46** | **2** | |

Both changed test files are unit tests with mocked dependencies. No integration or E2E coverage is present for these scenarios.

### Changed file coverage

Coverage analysis skipped — no coverage command was authorized or run.

## Assertion quality

No tautologies, ghost loops, smoke-only tests, or standalone type-only assertions were found. The `toBeDefined()` stream-return assertion is accompanied by concrete stream and header assertions, and the null file-token assertion is paired with a valid-token assertion. Boundary mock-call assertions are relevant to delegation/forwarding behavior.

A **CRITICAL coverage-quality defect** remains in the `mismatched dual` parameterized case: both header and body receive the same token, while only a body claim key differs. The test passes without exercising the behavior named by the case.

## Review workload and PR boundary

The authoritative attempt baseline comparison measured **125 changed lines**: 88 additions in `src/onlyoffice/onlyoffice.service.spec.ts` and 37 additions in `src/onlyoffice/onlyoffice.controller.spec.ts`, with no deletions. This is below the explicit 200-line hard stop; no `size:exception` or chained PR was selected. The candidate delta contains only the two approved test files. The apply receipt and other OpenSpec files are untracked and covered by the supplied excluded-inventory hash; they were not counted in the candidate line measurement. Pre-existing production-source and unrelated working-tree changes remain visible and were not modified or attributed to this successor.

## Exact blockers

1. Required authentication regression coverage remains incomplete, including a false-positive mismatched-dual test and missing invalid claim/file-token matrices.
2. Rejected service paths do not prove the required no-mutation and no-downstream-access observations.
3. Strict-TDD evidence is not concrete: the required `TDD Cycle Evidence` table and case-level RED/GREEN/TRIANGULATE/SAFETY-NET receipts are absent.
4. Controller tests do not prove the full HTTP-200 callback metadata/response contract required by the specification.

## Phase envelope

status: blocked
executive_summary: Required commands are green, but specification coverage and strict-TDD evidence are insufficient for archive.
artifacts: `openspec/changes/onlyoffice-auth-regressions-backend/verify-report.md`
next_recommended: remediate
risks:
- Archiving would preserve unsupported claims about regression coverage and task-level evidence.
- Existing pre-change production-source modifications must remain outside this successor's remediation scope.
skill_resolution: fallback-path

## Key Learnings

1. Passing regression suites do not prove coverage of every required authentication variant.
2. Task-level TDD receipts need case-specific failure and command evidence.
3. Candidate line budgets must be measured against the attempt baseline.
