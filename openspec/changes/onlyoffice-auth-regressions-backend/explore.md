# Exploration: onlyoffice-auth-regressions-backend

## Scope

Planning-only retry for missing backend authentication regression coverage and task-level strict-TDD evidence after the prior authentication-boundary verification failed. This slice covers only the existing OnlyOffice authentication surfaces and their focused tests:

- Header-only, body-only, matching dual-token, mismatched dual-token, malformed, empty, padded, non-string, and wrong-scheme transport variants.
- Missing, blank, malformed, expired, not-before, unsigned, and wrong-algorithm JWT/secret cases, including explicit HS256 verifier-option evidence.
- Verified-claim shape, route/key/document mismatches, body-versus-claim disagreement, unsupported status, and missing signed status-2 identity claims.
- File-token delegation, route-bound document identity, invalid file-token variants, missing generation secrets, missing latest versions, unknown documents, and stream non-dereference safety.
- Safe callback responses that remain HTTP 200 and expose only `{ error: 0 }` or `{ error: 1 }`.
- Rejected-path no-mutation assertions and task-level RED/GREEN/TRIANGULATE/SAFETY-NET receipts.

The implementation and focused test delta must remain below the canonical 400 changed-line review budget. No source or test files are edited during exploration, no commands are run, and no commit is created.

## Evidence and current gap

The prior `onlyoffice-auth-boundary-backend/verify-report.md` records passing focused suites, full tests, build, and scoped lint, but fails verification because the green tests omit the required authentication matrix and do not prove task-level TDD evidence. It specifically identifies missing dual-transport equality/mismatch cases, JWT time/algorithm and verifier-option cases, malformed or nested claims, route/body disagreement, file-token invalidity, valid stream behavior, missing-version stream safety, safe HTTP response assertions, and downstream no-mutation observations.

The prior tasks artifact defines five sequential work units over the existing four-file surface:

1. Service transport and shared JWT verification.
2. Verified route-bound claims and no-mutation behavior.
3. Shared file-token verification and file-state safety.
4. Callback forwarding and minimal response normalization.
5. Review-budget measurement and bounded verification.

The retry should preserve the implementation as evidence and add only the missing regression proof and receipts required to clear those blockers. Parameterized fixtures and existing mocks are preferred to keep the delta bounded.

## Expected evidence shape

Each task-level row should name the concrete regression case(s), record the RED failure before the corresponding correction, record the GREEN focused command and result, document TRIANGULATE observations (including verifier options, delegation, claim source, and no-mutation effects), and record the SAFETY-NET result. Aggregate prose or a work-unit-only table is insufficient. Rejected authentication and file-state paths must assert that fetch, Prisma access, stream creation, file writes, version/audit writes, document updates, or other observable mutation calls do not occur.

## Exclusions

Exclude production broadening, upstream retrieval/content/redirect validation, persistence redesign, duplicate/orphan cleanup, concurrency, deployment/networking/secret-distribution changes, migrations, dependencies, storage abstractions, `DocumentService.saveTextContent`, unrelated pending files, generated/runtime state, broad API or permission redesign, and lower-priority integration infrastructure. Do not expand into the later callback-hardening concerns except where a listed authentication regression requires a no-mutation assertion.

## Risks and review gate

- A larger matrix can exceed the review budget; retain high-value parameterized cases and stop at 400 changed lines for the configured `ask-on-risk` decision.
- Fail-closed secret, algorithm, transport, and claim checks may expose compatibility assumptions; do not weaken boundaries to make legacy cases pass.
- Tests that only assert `{ error: 1 }` can miss downstream effects; retain explicit mock-call assertions.
- Missing versions and invalid file tokens must fail before path or stream dereference and must not disclose diagnostics.

## Readiness

Ready for the next SDD phase as a narrow regression-and-evidence remediation. The existing authentication implementation remains the subject under test; this exploration authorizes no production broadening and no source/test edits in this phase.

status: ready
artifacts:
  explore: openspec/changes/onlyoffice-auth-regressions-backend/explore.md
next_recommended: proposal
skill_resolution: paths-injected
