# Exploration: OnlyOffice valid-signature route-mismatch TDD receipt

## Single work unit

Create one focused service regression in `src/onlyoffice/onlyoffice.service.spec.ts` for a
validly signed HS256 callback whose claim identifies document `7` while route document
`42` is requested. The case must return `{ error: 1 }` for route authorization failure,
not authentication failure, and must prove that downstream work is untouched.

## Strict-TDD sequence

1. **Fresh RED:** isolate the route-mismatch case and first capture a failing assertion
   for the intended observable boundary before recording any GREEN result. The token
   must already be signed with `secret.trim()`; do not use malformed or unsigned input.
2. **GREEN:** add the final route-mismatch assertion and make the focused case pass with
   `{ error: 1 }`, retaining the valid signature and route mismatch as the cause.
3. Reset mocks immediately after fixture construction and immediately before invocation;
   then assert zero calls for fetch, filesystem writes, Prisma document lookup and
   transaction, storage/path/move/delete/hash collaborators, and every exposed
   transaction delegate.
4. Record RED and GREEN as phase-owned receipts only; never reconstruct unavailable
   historical output.

## Boundaries

- Edit only the focused service spec and its phase-owned OpenSpec receipt if needed.
- Make no production, controller, configuration, schema, generated, or unrelated edits.
- Keep additions plus deletions strictly below 60 lines; stop and request ask-on-risk at
  60 lines or more, without inferring an exception or chain strategy.
- Do not run commands during exploration; this artifact records the implementation plan,
  not test or build results.
- No commit.

status: ready
skill_resolution: fallback-path
