# Proposal: Close OnlyOffice Authentication Evidence Gaps

## Intent

Produce a final, test/evidence-only correction for the failed backend verification. The change will prove the remaining authentication and missing-version safety contracts without changing production behavior, configuration, dependencies, or unrelated artifacts. The implementation/evidence delta is forecast at 60–95 changed lines; stop and ask under `ask-on-risk` before reaching 100 lines. No commit is authorized.

## Evidence basis

- `openspec/changes/onlyoffice-auth-regressions-final-backend/explore.md`
- `openspec/changes/onlyoffice-auth-regressions-backend/verify-report.md`
- Prior evidence revision: `sha256:a45c1bc678c31b410504ac306c68248f8c3803f44dc9c1c5b5a2bed8d3108dba`

The prior report found green suites but four evidence blockers: the mismatched-dual case reused one token, rejected paths lacked no-mutation assertions, missing-version safety was incomplete, and TDD evidence was aggregate rather than task-level.

## Scope

### Service regressions

Modify only `src/onlyoffice/onlyoffice.service.spec.ts` to:

1. Sign two distinct valid HS256 tokens with the same secret and independently valid route claims. Send one as the bearer token and the other as `body.token`; assert `{ error: 1 }` and prove rejection is caused by token disagreement, not an invalid claim. Retain the matching-dual acceptance control.
2. Add resettable, applicable no-mutation assertions for invalid verified claims and invalid file tokens. Observe that rejected paths do not invoke fetch, Prisma document/version/access calls, transactions, filesystem/path access, streams, storage moves, audits, or document updates. Invalid file tokens must stop before Prisma.

### Controller regressions

Modify only `src/onlyoffice/onlyoffice.controller.spec.ts` to cover absent documents and empty/absent `versions`. Permit the document lookup, but assert rejection before path dereference or `createReadStream`; retain the valid-stream case as the safety comparison.

### Task-level TDD receipt

Update the successor evidence receipt, or its phase-owned evidence artifact, with one row per remaining task. Each row must name the case and record the first RED failure, the exact focused GREEN command and result captured during apply, TRIANGULATE observations, and an independently attributable SAFETY-NET result. Do not invent historical command output or replace case-level receipts with aggregate prose.

## Affected areas and exclusions

| Area | Planned change |
|---|---|
| `src/onlyoffice/onlyoffice.service.spec.ts` | Distinct dual-token and service no-mutation regressions. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Missing-document/version stream-safety regressions. |
| Successor evidence receipt | Task-level TDD evidence only. |

No production source, schema, migration, configuration, dependency, generated file, storage implementation, callback behavior, or unrelated working-tree file may change. Do not broaden the authentication contract or add upstream, cleanup, persistence, or concurrency work.

## Review gate

Prefer existing fixtures and parameterized cases. Measure additions plus deletions for the successor delta. At 100 changed lines, stop and ask; do not infer a size exception or chain strategy. The canonical 400-line review budget remains protected by this stricter successor bound.

## Risks and mitigations

- **False-positive mismatch coverage:** use independently signed, unequal tokens and inspect the rejection cause and verifier/downstream observations.
- **Incomplete side-effect proof:** reset every relevant mock and assert each observable applicable to the rejected path.
- **Overclaiming TDD history:** record only captured RED, GREEN, TRIANGULATE, and SAFETY-NET evidence, preserving failures as blockers when evidence is unavailable.
- **A genuine production defect appears:** retain the failing test as evidence and stop; do not edit production code.

## Rollback

Revert only the successor test assertions/fixtures and its evidence rows. Preserve the prior failed reports, existing production changes, unrelated working-tree state, and all database/runtime state. No production rollback or migration is required.

## Success criteria

1. The mismatched-dual test uses two unequal, independently valid tokens and distinguishes token disagreement from claim rejection; matching dual transport still passes.
2. Applicable rejected service paths prove no downstream mutation or access, and invalid file tokens stop before Prisma.
3. Absent documents and missing/empty versions reject without path access or stream creation, while the valid stream control remains green.
4. The evidence receipt contains case-specific task-level RED, GREEN, TRIANGULATE, and SAFETY-NET records without fabricated commands.
5. Only the two existing specs and evidence artifact change, no production edits or commands occur in proposal, no commit is created, and the successor stays below 100 changed lines.

## Next phase

Translate this bounded proposal into minimal acceptance criteria and ordered test/evidence tasks. Apply may edit only the two existing OnlyOffice specs and the successor evidence receipt; verification must preserve prior failures and independently inspect the recorded evidence.

status: ready
artifacts:
  proposal: openspec/changes/onlyoffice-auth-regressions-final-backend/proposal.md
next_recommended: spec
