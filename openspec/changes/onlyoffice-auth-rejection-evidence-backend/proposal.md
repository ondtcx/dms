# Proposal: Repair OnlyOffice Rejection Evidence

## Intent and problem statement

Repair the deterministic OnlyOffice rejection-evidence blockers without changing production behavior. The current controller matrix fails before its intended assertion because it passes the literal token `token` while the verifier mock expects `invalid-${label}`. The service rejection matrix returns `{ error: 1 }` but does not prove that rejected authentication or file-token paths avoid downstream work, including Prisma access for invalid file tokens.

This is a test/evidence-only successor. No production source, configuration, dependency, schema, generated file, or unrelated working-tree file is in scope. No source edits or commands are performed during proposal.

## Evidence basis

- `openspec/changes/onlyoffice-auth-rejection-evidence-backend/explore.md`
- `openspec/changes/onlyoffice-auth-regressions-final-backend/verify-report.md`
- Prior evidence revision: `sha256:708616d901f90946b20318cfa7ed80bfb318d9b7c2d371590a3cf20e03273aea`

The prior report confirms that historical RED evidence is unavailable. That status must remain explicit; no RED failure may be reconstructed, inferred, or fabricated.

## Scope

### Controller invocation correction

Modify only `src/onlyoffice/onlyoffice.controller.spec.ts` to make each invalid-file-token matrix invocation pass the same `invalid-${label}` value configured in its `verifyFileToken` expectation. Preserve the existing rejection and Prisma no-call assertions so the intended downstream boundary is actually exercised. Do not add unrelated controller coverage or modify the controller implementation.

### Service rejection and invalid-file-token evidence

Modify only `src/onlyoffice/onlyoffice.service.spec.ts` to:

1. Reset applicable mocks for each rejected service case and assert that rejection does not invoke the existing observable downstream collaborators: fetch, Prisma document/version access, transactions, filesystem/path operations, streams, storage, audit, or document updates, as applicable to each path.
2. Extend invalid file-token cases for malformed, expired, unsigned, wrong-algorithm, wrong-route, and missing-secret inputs.
3. Assert that every invalid file-token case rejects before Prisma document/version lookup, transaction, or other persistence access. Keep missing-document and missing-version behavior outside this narrow slice.

Use existing fixtures and mocks. Assertions must demonstrate the externally observable no-mutation boundary, not implementation details beyond the existing mock surface.

### Evidence receipt

Record only evidence actually captured in the successor phase. Preserve historical RED as `unavailable`; do not replace it with current failures or claims inferred from green results. Any GREEN, TRIANGULATE, or SAFETY-NET entry must identify the affected case and exact evidence source.

## Affected areas and exclusions

| Area | Planned change |
|---|---|
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Correct invalid-token test invocation and retain reachable no-Prisma evidence. |
| `src/onlyoffice/onlyoffice.service.spec.ts` | Add rejection no-mutation and invalid file-token-before-Prisma assertions. |
| Successor evidence receipt | Preserve unavailable RED and record only captured evidence. |

Excluded: production controllers/services, callback authentication transport, claim-shape expansion, missing-document/version behavior, stream contract expansion, upstream validation, persistence redesign, cleanup, concurrency, migrations, dependencies, and unrelated files.

## Review gate

The successor must remain strictly under 100 changed lines, counting additions and deletions across the two test specs and evidence receipt. Prefer parameterized cases and existing setup. If the forecast reaches 100 lines, stop and ask under `ask-on-risk`; do not infer a size exception or chain strategy. No commit is authorized.

## Risks and mitigations

- **False no-mutation confidence:** reset mocks per case and assert every applicable observable collaborator, including the explicit Prisma boundary for invalid file tokens.
- **Still-unreachable controller evidence:** pass the exact token expected by the verifier mock and retain an assertion that the verifier was called with that token.
- **Overclaiming historical TDD evidence:** retain RED as unavailable and record no unobserved command output.
- **A genuine production defect is exposed:** preserve the failing evidence and stop; do not edit production source or weaken the assertion.
- **Review scope expands:** defer unrelated cases and stop at the under-100-line gate.

## Rollback

Revert only the successor test assertions, fixtures, and evidence rows. Preserve the prior failed verify report, production working-tree changes, unrelated artifacts, and unavailable-RED statement. No production rollback or migration is required.

## Success criteria

1. Every controller invalid-token row passes the token expected by its verifier mock, and its downstream no-Prisma assertion becomes reachable.
2. Rejected service cases prove applicable downstream collaborators were not called.
3. Malformed, expired, unsigned, wrong-algorithm, wrong-route, and missing-secret file tokens reject before Prisma access.
4. Historical RED remains explicitly unavailable, with no reconstructed or fabricated failure evidence.
5. Only the two existing test specs and successor evidence artifact are changed, no production source is edited, no commands are run in proposal, no commit is created, and the successor remains below 100 changed lines.

## Next phase

Translate this bounded proposal into minimal acceptance criteria and ordered test/evidence tasks. Apply may edit only the two existing OnlyOffice test specs and the phase-owned evidence receipt; verification must independently inspect the reachable controller invocation and service no-mutation assertions.

status: ready
artifacts:
  proposal: openspec/changes/onlyoffice-auth-rejection-evidence-backend/proposal.md
next_recommended: spec
