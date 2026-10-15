# Design: Instrument the OnlyOffice Route-Mismatch Boundary

## Decision

Use the existing resettable fixture in `src/onlyoffice/onlyoffice.service.spec.ts`; do not
create another service double or change production code. The existing authentication-regression
`route key mismatch` row becomes the sole focused evidence for this boundary. Remove the earlier
standalone route-mismatch case that constructs empty dependencies, since it duplicates this case
without observable downstream collaborators.

## Exact fixture and assertions

- Reuse `createService()` from `OnlyofficeService authentication regressions`, including the
  padded secret `' onlyoffice-secret '`, `config.get`, `prisma`, `storage`, `tx`, and `fetchMock`.
- Keep the route-mismatch input as a real HS256 token signed with `secret.trim()`, with claims
  `{ status: 1, key: 'doc_7_save_1' }`, submitted to route document `42`.
- Call `jest.clearAllMocks()` after fixture/token setup and immediately before `handleCallback`.
  This preserves mock implementations while excluding fixture setup and prior rows from evidence.
- Retain the expected result `{ error: 1 }`, then invoke `expectNoDownstreamWork(context)`.
- Extend that helper with an explicit `tx.$queryRawUnsafe` zero-call assertion; retain its nested
  transaction sweep for `onlyofficeCallbackReceipt.create`, transaction document/user lookups,
  `documentVersion.create`, `document.update`, and `documentAccess.create`.
- The helper must continue asserting zero calls for `fetchMock`, `fs.writeFileSync`,
  `prisma.document.findUnique`, `prisma.$transaction`, and every storage method (`getPaths`,
  path generation, move, delete, and hash).

## Data flow and contract

A valid signature and HS256 verifier pass establish authentication. The signed `doc_7` key then
fails the route-42 key pattern before URL parsing, document lookup, fetch, filesystem work,
storage movement, hashing, or transaction entry. The service contract remains `{ error: 1 }`;
no runtime behavior or collaborator API changes are designed.

## Evidence and test plan

The only implementation test change is the focused service fixture/assertion adjustment. The
phase-owned `apply-progress.md` receipt may record captured successor observations, but its RED
entry must remain exactly `unavailable`; no historical failure is reconstructed from current
results. GREEN, TRIANGULATE, and SAFETY-NET fields must contain only observations captured during
apply/verification.

Review the service-spec and receipt diffs, confirm production files are untouched, and measure
additions plus deletions. Forecast: 25–40 changed lines across the test and receipt, strictly
below 60. If the forecast or measured delta reaches 60, stop and request the configured
`ask-on-risk` decision; infer neither an exception nor a chain strategy. No command or commit is
part of this design phase.

## Scope and rollback

Edit surfaces are limited to `src/onlyoffice/onlyoffice.service.spec.ts` and
`openspec/changes/onlyoffice-auth-route-mismatch-backend/apply-progress.md`. Controller tests,
production source, configuration, persistence, dependencies, generated files, and unrelated
artifacts remain excluded. Rollback is limited to reverting these successor test/evidence changes.

status: ready
artifacts:
  design: openspec/changes/onlyoffice-auth-route-mismatch-backend/design.md
next_recommended: tasks
skill_resolution: fallback-path
