# Proposal: Add direct null-secret OnlyOffice evidence

## Problem statement

The prior verification report for `onlyoffice-secret-lookup-fail-closed-backend` found one remaining evidence blocker: the verifier has no dedicated direct regression for a `null` `ONLYOFFICE_SECRET` lookup result. Production already fails closed through its existing non-string secret guard, and the throwing-lookup case already has GREEN and no-downstream evidence. This narrow successor closes only the missing evidence gap.

## Intent

Add one focused, GREEN-only service regression proving that a direct `null` OnlyOffice secret lookup returns `null` and performs no downstream work. Preserve the prior report's unavailable historical RED status; do not fabricate or reconstruct a RED result.

## Work unit

1. In `src/onlyoffice/onlyoffice.service.spec.ts`, create the existing service fixture with `createService(null)`.
2. Call `context.service.verifyFileToken('token', 42)` and assert the concrete `null` result.
3. Reuse `expectNoDownstreamWork(context)` to prove fetch, filesystem, storage, Prisma, and transaction collaborators remain unused.

This is test/evidence-only. No production edit, controller edit, configuration change, persistence change, or unrelated test change is authorized. The implementation-and-regression delta must remain below 40 changed lines.

## Scope

### In scope

- One direct service-spec regression for a `null` `ConfigService.get('ONLYOFFICE_SECRET')` result.
- Concrete null-result and zero-downstream-call assertions using existing fixtures and helpers.
- GREEN execution evidence for this case only.

### Out of scope

- All production files, including `src/onlyoffice/onlyoffice.service.ts`.
- Controller routes, controller specs, callback behavior, and other authentication matrices.
- New helpers, fixture refactors, configuration, Prisma, filesystem, storage, or generated files.
- Any RED claim, historical RED reconstruction, command execution, or commit.

## Affected areas

- `src/onlyoffice/onlyoffice.service.spec.ts` — one regression test only.
- `openspec/changes/onlyoffice-secret-null-evidence-backend/proposal.md` — this proposal artifact.

Production behavior is intentionally unaffected.

## Risks and mitigations

- **Risk:** The test could prove only the return sentinel. **Mitigation:** Reuse the established non-empty `expectNoDownstreamWork(context)` assertions from the prior evidence.
- **Risk:** The successor could expand into unrelated authentication work. **Mitigation:** Restrict the change to one direct `null` case and enforce the under-40-line budget.
- **Risk:** GREEN evidence could be misrepresented as strict historical TDD evidence. **Mitigation:** Label the work GREEN-only and preserve the prior report's unavailable RED status.

## Rollback

Revert the single service-spec regression and this proposal artifact. No production or operational rollback is required because runtime behavior is unchanged.

## Success criteria

- The direct `createService(null)` verifier case passes with a concrete `null` result.
- The same case proves zero calls to the established downstream collaborators.
- Only the service spec receives the planned implementation change, with fewer than 40 changed lines.
- No production files or unrelated tests are edited, and no RED evidence is fabricated.
- The prior verification blocker is resolved by independently observable null-secret evidence.
