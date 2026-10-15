# Design: Add Direct Null-Secret OnlyOffice Evidence

## Outcome

Add one GREEN-only regression to `src/onlyoffice/onlyoffice.service.spec.ts` proving that a direct `null` `ONLYOFFICE_SECRET` lookup returns `null` and performs no downstream work. Production behavior and every non-target test remain unchanged.

## Decision

Reuse the existing authentication-regression fixture and helper exactly as they are. The test will call `createService(null)`, whose `args.length ? args[0] : secret` branch preserves an explicit `null`; its `config` double is therefore `{ get: jest.fn().mockReturnValue(null) }`. Do not replace this with `undefined`, a throwing implementation, or a new fixture.

The focused test shape is:

```ts
it('fails closed when secret lookup returns null', () => {
  const context = createService(null);
  expect(context.service.verifyFileToken('token', 42)).toBeNull();
  expectNoDownstreamWork(context);
});
```

`verifyFileToken` synchronously delegates to `verifyToken`; the non-string guard treats `null` as invalid and returns the concrete `null` sentinel before JWT verification or any collaborator work. No extra `config.get` setup is needed or authorized because `createService(null)` is the exact null lookup setup.

## Exact existing evidence boundary

`expectNoDownstreamWork(context)` must be reused without modification. It already asserts:

- `fetchMock` was not called.
- `fs.writeFileSync` was not called.
- `prisma.document.findUnique` was not called.
- `prisma.$transaction` was not called.
- Every mock in `storage` (`getPaths`, `generateStructuredPath`, `moveFile`, `deleteFile`, and `calculateFileHash`) was not called.
- `tx.$queryRawUnsafe` was not called.
- Every nested transaction mock was not called, including callback receipt creation, transaction document and user lookups, document-version creation, document update, and document-access creation.

These assertions establish that the null result short-circuits before persistence, network, filesystem, storage, hashing, and transaction work. The test does not add a separate `jwt.verify` assertion; the required contract is the direct null result plus the established downstream-work boundary.

## Data flow

```text
createService(null)
  -> config.get('ONLYOFFICE_SECRET') returns null
  -> verifyToken rejects the non-string secret
  -> verifyFileToken('token', 42) returns null
  -> no fetch, filesystem, storage, Prisma, or transaction calls
```

The existing controller continues to interpret a falsy verifier result as unauthorized. This design does not change that runtime path.

## Scope and planned change

Only one test is planned in `src/onlyoffice/onlyoffice.service.spec.ts`, inside `OnlyofficeService authentication regressions`, immediately alongside the existing throwing-lookup regression. No fixture refactor, helper change, production edit, controller change, configuration change, persistence change, generated-file change, or unrelated test change is allowed.

The focused test addition is five changed lines (the `it` declaration, fixture creation, null assertion, helper assertion, and closing line), safely below the fewer-than-40 changed-line gate. This design phase performs no commands and no source edits.

## Evidence and rollout

Report this case as GREEN evidence only. Historical RED evidence remains unavailable and must not be reconstructed from the current passing implementation. Verification should review the single service-spec diff, confirm production files are untouched, and confirm the implementation-and-regression delta remains below 40 changed lines.

Rollback is limited to removing the focused test; no production or operational rollback is required.

## SDD result

status: ready
artifacts:
  design: openspec/changes/onlyoffice-secret-null-evidence-backend/design.md
next_recommended: apply
skill_resolution: fallback-path
