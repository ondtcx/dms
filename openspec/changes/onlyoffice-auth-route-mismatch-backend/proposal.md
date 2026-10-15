# Proposal: Instrument OnlyOffice Route-Mismatch Rejection

## Intent and problem statement

The signed-identity route-mismatch test returns `{ error: 1 }` but uses empty dependency doubles, so a downstream call could be swallowed without failing the test. Add observable zero-call evidence for this rejected service path without changing runtime behavior.

This is a final, test/evidence-only successor. No production source, configuration, schema, dependency, generated file, unrelated artifact, commit, or command execution is in scope for proposal.

## Evidence basis

- `openspec/changes/onlyoffice-auth-route-mismatch-backend/explore.md`
- `openspec/changes/onlyoffice-auth-rejection-evidence-backend/verify-report.md`
- Prior evidence revision: `sha256:aae65dd087c1208e741b7b45d6166ca5ada1a4ccd7553c95dbe6779ef5347b88`

Historical RED evidence remains unavailable. Do not reconstruct, infer, or claim a prior failing result.

## Scope

Modify only `src/onlyoffice/onlyoffice.service.spec.ts` and the phase-owned evidence receipt:

1. Reuse the existing resettable service fixture and no-downstream assertion helper, keeping the case scoped to `handleCallback`.
2. Preserve a validly signed token whose route claim identifies document `7`, invoke route `42`, and retain the expected `{ error: 1 }` response.
3. Clear applicable mocks after fixture construction and immediately before invocation.
4. Assert zero calls to fetch, filesystem write, Prisma document lookup and transaction, storage/path/hash collaborators, and every transaction delegate exposed by the fixture.
5. Record only captured apply/verification evidence; keep historical RED explicitly `unavailable`.

Do not add controller coverage, invalid file-token cases, production instrumentation, persistence changes, or unrelated assertions.

## Affected areas and review gate

| Area | Planned change |
|---|---|
| `src/onlyoffice/onlyoffice.service.spec.ts` | Add downstream no-call assertions to the existing route-mismatch rejection case. |
| Successor evidence receipt | Record actual evidence while preserving unavailable RED. |

The successor must remain under 60 changed lines, counting additions and deletions across the test and evidence receipt. If the forecast or measured delta reaches 60, pause under `ask-on-risk`; do not infer an exception or chain strategy. The canonical 400-line budget remains low risk.

## Risks and rollback

- **False boundary evidence:** reset mocks immediately before invocation and assert each applicable existing collaborator.
- **Authentication case drift:** retain a valid signature and vary only the route-bound identity mismatch.
- **Overclaiming TDD history:** preserve RED as unavailable and record no unobserved output.
- **Scope expansion:** stop at the 60-line gate and leave controller, production, and unrelated cases unchanged.

Rollback is limited to the successor test assertions, fixture wiring, and evidence rows. Preserve prior reports, working-tree changes, and the unavailable-RED statement.

## Success criteria

1. The validly signed route-mismatch case still resolves to `{ error: 1 }`.
2. The case proves all applicable downstream collaborators remain untouched after rejection.
3. Only the service test and phase-owned evidence receipt change; no production source is edited.
4. Historical RED remains explicitly unavailable, and the measured successor stays below 60 changed lines.
5. No command or commit is produced during proposal.

status: ready
artifacts:
  proposal: openspec/changes/onlyoffice-auth-route-mismatch-backend/proposal.md
next_recommended: spec
skill_resolution: fallback-path
