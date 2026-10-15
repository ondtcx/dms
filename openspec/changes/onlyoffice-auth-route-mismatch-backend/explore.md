# Exploration: OnlyOffice route-mismatch rejection instrumentation

## Scope

This successor is limited to service-level route-mismatch rejection evidence in
`src/onlyoffice/onlyoffice.service.spec.ts`. It adds resettable downstream
zero-call assertions only; it does not change production code, controller tests,
configuration, persistence behavior, or unrelated files.

## Current evidence

`OnlyofficeService.handleCallback` validates the signed key against the route
before document lookup, fetching, filesystem work, storage movement, or the
transaction. The service regression fixture already exposes Prisma, fetch,
storage, filesystem, and transaction mocks, but route-mismatch coverage must
prove those collaborators remain untouched after rejection.

## Instrumentation plan

- Keep the existing valid signed token and route-mismatched signed key as the
  focused rejection case.
- Reset all downstream mocks after fixture construction and immediately before
  invoking the service, so fixture setup or prior parameterized cases cannot
  contaminate zero-call evidence.
- Assert the rejected result remains `{ error: 1 }`.
- Assert zero calls for fetch, document lookup, transaction, filesystem write,
  storage path/move/delete/hash collaborators, and every transaction delegate
  exposed by the fixture.
- Keep the assertion helper reusable and scoped to the service rejection matrix;
  do not broaden it into controller or production instrumentation.
- Preserve the distinction between authentication rejection and route-claim
  rejection; the route mismatch must be reached with a validly signed token.

## Evidence boundary

Historical RED evidence remains unavailable. Do not reconstruct, infer, or
claim a prior failing result; record only the intended rejection instrumentation
and its observable call boundary.

## Exclusions

No production or unrelated work is authorized. Do not alter OnlyOffice runtime
behavior, callback persistence, upstream retrieval, file handling, controller
routes, or shared configuration.

status: ready
artifacts:
  explore: openspec/changes/onlyoffice-auth-route-mismatch-backend/explore.md
next_recommended: proposal
skill_resolution: fallback-path
