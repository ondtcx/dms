# Proposal: Restore OnlyOffice Authentication Regression Evidence

## Intent

Remediate the two blockers from the failed OnlyOffice authentication-boundary verification with a narrow successor focused only on regression tests and strict-TDD evidence. The existing production implementation remains the subject under test; this proposal authorizes no production behavior broadening.

This is a planning-only artifact. It does not edit source files or tests, run tests, create a commit, or touch unrelated working-tree changes. The planned implementation/test/evidence delta is forecast below 200 changed lines, with a hard stop at 200 under `ask-on-risk`; no `size:exception` is authorized.

## Evidence and current gap

This proposal is based on:

- `openspec/changes/onlyoffice-auth-regressions-backend/explore.md`
- `openspec/changes/onlyoffice-auth-boundary-backend/verify-report.md`
- Prior failed evidence revision: `sha256:d4156831e18abaf853ab8582a4e5b8f20bb643be3446ffbabc4d1129892e98c5`

The prior focused suites, full suite, build, and scoped lint passed, but verification failed for two evidence reasons:

1. The focused tests omit material authentication regressions: dual-token equality and mismatch, empty/padded/non-string/wrong-scheme transport, missing and blank secrets, malformed/expired/not-before/unsigned/wrong-algorithm JWTs, explicit HS256 verifier options, malformed or nested claims, route and body/claim disagreement, unsupported status, missing signed status-2 identity, invalid file tokens, valid stream behavior, missing-version stream safety, safe HTTP-200 responses, and rejected-path no-mutation observations.
2. `apply-progress.md` records five aggregate work-unit summaries rather than concrete RED/GREEN/TRIANGULATE/SAFETY-NET receipts for the checked task markers. Passing suites therefore do not independently prove the required task-level TDD evidence.

The prior implementation delta was 276 changed lines within its own four-file boundary. This successor adds only the missing test/evidence proof and must remain a separately bounded, reviewable slice.

## Scope

### 1. Add focused service regressions

Extend only `src/onlyoffice/onlyoffice.service.spec.ts`, using existing fixtures and mocks where possible, to cover:

- Header-only, body-only, matching dual-token, mismatched dual-token, malformed, empty, padded, non-string, and wrong-scheme transports.
- Missing, undefined, and blank secrets; malformed, expired, not-before, unsigned, and wrong-algorithm tokens; and a verifier spy that inspects the explicit `{ algorithms: ['HS256'] }` option.
- Verified direct and nested claim shapes, invalid claim shapes, route key/document mismatches, body-versus-claim disagreement, unsupported status, and missing signed status-2 URL/user identity claims.
- File-token delegation/verification, route-bound document identity, invalid file-token variants, missing generation secrets, missing latest versions, unknown documents, valid stream behavior, and stream non-dereference safety.
- Explicit no-mutation assertions for rejected authentication or file-state paths, including fetch, Prisma, stream, file, version, audit, and document-update observations applicable to each case.

Tests must assert the existing contract rather than require new production behavior or broaden accepted inputs.

### 2. Add focused controller regressions

Extend only `src/onlyoffice/onlyoffice.controller.spec.ts` to cover:

- Raw authorization/body forwarding and file-token verification delegation.
- A valid file response with the existing stream contract and identity binding.
- Missing document/latest-version rejection without `createReadStream` dereference.
- Callback success and failure responses that remain HTTP 200 and contain exactly `{ error: 0 }` or `{ error: 1 }`, with no token, secret, URL, or exception details.

### 3. Record task-level strict-TDD evidence

Update the apply receipt for this successor so every task-level marker has a concrete evidence row. Each row must name the regression case(s) and record:

- **RED:** the focused test failure observed before the corresponding test/receipt correction, including the case and failure signal;
- **GREEN:** the exact focused command and result;
- **TRIANGULATE:** verifier options, delegation, verified claim source, response shape, and no-mutation observations relevant to that task;
- **SAFETY-NET:** the independently recorded pre-change safety-net result for the affected focused suite or evidence surface.

Aggregate five-work-unit prose is insufficient. If predecessor task markers are carried into this receipt, each of the 20 checked markers must be individually referenced or supplied with concrete evidence; no task may be represented as complete solely because an aggregate suite passed.

## Allowed surface and affected areas

| Area | Planned change |
|---|---|
| `src/onlyoffice/onlyoffice.service.spec.ts` | Add parameterized service-level authentication, claim, file-token, stream-safety, and no-mutation regressions. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Add controller boundary, delegation, safe-response, and stream non-dereference regressions. |
| `openspec/changes/onlyoffice-auth-regressions-backend/apply-progress.md` | Record task-level RED/GREEN/TRIANGULATE/SAFETY-NET receipts and bounded review evidence. |

No production source file, schema, migration, dependency, configuration, generated output, storage abstraction, or unrelated file is in scope.

## Explicit exclusions and non-goals

Exclude upstream retrieval, URL/content/redirect validation, cleanup, duplicate/orphan handling, persistence redesign, transactions, idempotency, concurrency, deployment, networking, topology, secret distribution, migrations, dependencies, broad API or permission redesign, and unrelated pending files. Do not edit `DocumentService.saveTextContent`, storage behavior, callback processing, or any production authentication implementation to make a new case pass.

The tests may observe existing downstream calls to prove rejected paths do not mutate state, but they must not implement or broaden those downstream behaviors. Do not include `.gitignore`, `src/settings/settings.service.ts`, `.pi/`, `.codegraph/`, generated/runtime state, or any other pre-existing working-tree change.

## Review-budget forecast and gate

The forecast counts additions plus deletions in the planned test/evidence slice:

| Work area | Forecast |
|---|---:|
| Service regressions | 65–95 |
| Controller regressions | 25–40 |
| Task-level evidence receipts | 20–45 |
| **Total** | **110–180** |

At 200 or more changed lines, pause and ask under `ask-on-risk`; defer lower-value duplicate fixtures rather than selecting a chain strategy or `size:exception`. The proposal phase itself runs no tests and has no source/test edits.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A missing regression exposes a genuine production defect. | Record the RED evidence and stop within this test/evidence-only slice; do not change production behavior or silently weaken the assertion. |
| Parameterized cases create false confidence through shared setup. | Assert concrete inputs, verified claims/options, exact safe responses, and relevant mock call or no-call effects per case. |
| Strict-TDD receipts become aggregate prose again. | Require one named row per task marker with all four evidence fields and case-level results. |
| The matrix exceeds the review budget. | Prefer existing fixtures and parameterization, defer lower-value cases, and ask at the 200-line gate. |
| Failure assertions disclose or encode sensitive diagnostics. | Assert only the existing minimal response shape and absence of token, secret, URL, and exception details. |

## Rollback and recovery

- Revert only the added focused test cases and evidence receipt if the successor must be withdrawn; no production rollback or data migration is needed.
- Preserve the existing implementation and all unrelated pending files.
- If a test demonstrates behavior outside the confirmed boundary, retain the evidence as a blocker and request a separate product/implementation decision rather than expanding this slice.

## Success criteria

1. The two existing OnlyOffice specs cover the listed missing authentication, claim-binding, file-token, stream-safety, safe-response, and no-mutation regressions.
2. JWT tests independently observe the configured secret guard, normal time-claim rejection, and explicit HS256 verifier options.
3. Rejected authentication and file-state cases assert applicable downstream fetch, Prisma, stream, file, version, audit, and document-update calls do not occur.
4. Controller tests prove the existing HTTP-200 callback contract contains only `{ error: 0 }` or `{ error: 1 }` and exposes no sensitive diagnostics.
5. The apply receipt provides concrete RED, GREEN, TRIANGULATE, and SAFETY-NET evidence at task-marker granularity, including all carried predecessor markers.
6. No production behavior is changed or broadened, no excluded area is touched, and the successor remains below 200 changed lines with no size exception.

## Next phase and delivery context

The next SDD phase should translate this proposal into minimal acceptance criteria and ordered test/evidence tasks. Apply must remain limited to the two existing OnlyOffice spec files and the task-level receipt. Tests and source changes are not authorized during this proposal phase; later verification must use the recorded focused, full-suite, build, and quality evidence required by the repository configuration.

Delivery remains `ask-on-risk`, with no commit, chaining decision, or `size:exception` authorized by this proposal.
