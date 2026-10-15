# Exploration: onlyoffice-secret-null-evidence-backend

## Scope

This narrow successor addresses the single verifier evidence blocker: add one test-only GREEN case for a `null` OnlyOffice secret lookup. Production behavior is already correct and remains unchanged.

## Existing evidence

- `src/onlyoffice/onlyoffice.service.ts` routes `verifyFileToken(token, documentId)` through `verifyToken`.
- `verifyToken` reads `ConfigService.get<unknown>('ONLYOFFICE_SECRET')` inside its existing `try/catch`.
- A non-string secret, including `null`, returns `null` before JWT verification or downstream work.
- `src/onlyoffice/onlyoffice.service.spec.ts` already provides `createService()` and `expectNoDownstreamWork(context)`.
- The prior verification report identifies only the missing dedicated direct `null` case and its execution evidence.

## Evidence plan

Add one focused service-spec test using `const context = createService(null)`.
Call `context.service.verifyFileToken('token', 42)` and assert `toBeNull()`.
Then call `expectNoDownstreamWork(context)` to prove fetch, filesystem, storage, Prisma, and transaction collaborators were not called.

This is GREEN evidence only. No RED claim is made or reconstructed because the current production behavior already passes the case.

## Boundaries

Only `src/onlyoffice/onlyoffice.service.spec.ts` is in scope. Do not modify production files, controller files, routes, configuration, persistence, or unrelated authentication tests. No commands or commit are part of this exploration.

## SDD result

status: ready
next_recommended: apply
skill_resolution: fallback-path
