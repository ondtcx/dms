# Exploration: onlyoffice-auth-regressions-final-backend

## Scope

This retry is limited to the remaining regression-test and evidence corrections from the failed backend verification. It changes no production code and excludes unrelated OnlyOffice or repository domains. The allowed test surface is the existing service and controller specs, with this artifact recording the plan.

## Remaining fixes

1. **Make dual-token mismatch real.** Sign two distinct valid HS256 tokens with the same configured secret and claims that independently satisfy the route contract. Pass one in `Authorization: Bearer <headerToken>` and the other in `body.token`; assert `{ error: 1 }`, and prove the verifier/downstream observations match the rejected ambiguous transport rather than a claim mismatch. Retain the matching dual-token acceptance case.
2. **Add concrete no-mutation assertions.** For invalid verified claims (primitive/array/malformed envelope, route or body disagreement, unsupported status, and missing status-2 identity), invalid file tokens (malformed, expired, unsigned, wrong algorithm, wrong route, and missing secret), and missing-document/latest-version paths, reset and assert every applicable observable is untouched: `fetch`, Prisma document/version/access calls, transactions, filesystem writes/path access, `createReadStream`, storage moves, audits, and document updates. Invalid file tokens must stop before Prisma; missing versions may perform the document lookup but must not dereference a path or create a stream.
3. **Replace aggregate TDD prose with task-level receipts.** Add a compact `TDD Cycle Evidence` table to the successor apply receipt (or the phase-owned evidence artifact) with one row per remaining task. Each cell must identify the case, first RED failure, exact GREEN focused command/result, TRIANGULATE observation, and independent SAFETY-NET result. Do not claim historical commands that were not captured.

## Evidence boundaries

Use parameterized fixtures and existing mocks in `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts`. The test assertions must distinguish authentication rejection from claim rejection and must preserve the safe `{ error: 1 }` result. The missing-version controller cases should cover both absent documents and empty/absent `versions`; the valid stream case is retained only as a safety comparison, not expanded into another domain.

## Task-level TDD evidence table

| Task | RED evidence to capture | GREEN evidence to capture | TRIANGULATE and SAFETY-NET |
|---|---|---|---|
| Dual-token distinction | A named test fails because two independently signed, valid tokens are not equal. | Focused service-spec command and exact passing case are recorded. | Confirm equality is the rejection reason, then record matching-dual and prior service baseline passes. |
| Invalid claims and file tokens | Named invalid claim/file-token cases fail without complete call assertions. | Focused service/controller commands and per-case results are recorded. | Record verifier/delegation ordering and every applicable zero-call assertion; retain prior focused baseline. |
| Missing version safety | Missing-document/version case fails when path or stream access is observed. | Focused controller command and exact cases are recorded. | Record allowed Prisma lookup and absent path/`createReadStream`; record valid-stream safety comparison. |

## Exclusions and gate

Do not edit `onlyoffice.service.ts`, `onlyoffice.controller.ts`, configuration, schema, dependencies, or unrelated files. Do not broaden callback behavior, persistence, upstream retrieval, storage, or permissions. Do not run commands during exploration. Keep the successor test/evidence delta under 100 changed lines; stop and ask under the configured `ask-on-risk` policy if that bound or the canonical 400-line review budget is threatened.

status: ready
artifacts:
  explore: openspec/changes/onlyoffice-auth-regressions-final-backend/explore.md
next_recommended: proposal
skill_resolution: fallback-path
