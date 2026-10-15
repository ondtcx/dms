# Design: Fail Closed on OnlyOffice Secret Lookup Errors

## Outcome

Use one direct-service strict-TDD work unit so a throwing
`ConfigService.get('ONLYOFFICE_SECRET')` becomes a `null` verification result.
The existing controller behavior and controller suite remain a safety net only;
no controller test or controller production change is planned.

## Decision

Move the existing secret lookup into the `try/catch` in
`OnlyofficeService.verifyToken`. Its existing catch already normalizes JWT and
claim failures to `null`; including the lookup adds only the required fail-closed
boundary. Keep the secret validation, token validation, JWT options, and claim
handling unchanged. Do not broaden catches around Prisma or file streaming.

## Strict-TDD sequence

### RED

First add a fresh service regression in the authentication service spec. Reuse
`createService()` and replace only `context.config.get` with a sentinel throw.
Call the direct verifier and capture the current failure: the lookup error
escapes before the existing `try`. This RED state must be observed before the
production lookup is moved.

### GREEN

Move only the secret lookup and its existing validation into `verifyToken`'s
current `try/catch`. The direct `verifyFileToken` call must then return `null`
without exposing or rethrowing the lookup error. Assert
`expectNoDownstreamWork(context)` in the same case so fetch, filesystem,
storage, Prisma, and transaction collaborators remain unused.

## Existing fixture and contracts

Retain the existing `createService` fixture; do not create a second fixture or
new downstream harness. Its config, Prisma, storage, transaction, and fetch
mocks already support the direct verifier boundary and
`expectNoDownstreamWork(context)` assertion.

The data flow is:

```text
ConfigService.get(ONLYOFFICE_SECRET)
  -> guarded verifyToken
  -> null on lookup, JWT, or claim failure
  -> verifyFileToken returns null
  -> existing controller rejects unauthorized
```

Successful verification and all other token behavior remain unchanged. The
existing controller suite is retained only as safety-net coverage; no new
controller test design is included.

## Planned changes and exclusions

- `src/onlyoffice/onlyoffice.service.ts`: move the existing lookup into the
  verifier's current `try/catch`, with no unrelated production edits.
- `src/onlyoffice/onlyoffice.service.spec.ts`: add the fresh RED/GREEN direct
  verifier regression using `createService` and `expectNoDownstreamWork`.
- Do not change controller source or add controller tests.
- Do not change routes, configuration, persistence, file handling, or unrelated
  authentication behavior.

## Changed-line forecast

Service guard: 2–4 lines. Service regression: 10–14 lines. Total:
16–24 changed lines, strictly below 60. If the concrete implementation diff
reaches 60 lines, pause for the configured `ask-on-risk` review decision.

## SDD result

status: ready
artifacts:
  design: openspec/changes/onlyoffice-secret-lookup-fail-closed-backend/design.md
next_recommended: tasks
risks:
  - The RED failure must be captured before moving the lookup into the try/catch.
  - The GREEN case must prove both null normalization and no downstream work.
skill_resolution: fallback-path
