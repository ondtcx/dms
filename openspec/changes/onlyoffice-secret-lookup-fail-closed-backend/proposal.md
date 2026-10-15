# Proposal: Fail closed when OnlyOffice secret lookup throws

## Intent

Make the OnlyOffice file-token verifier fail closed when `ConfigService.get('ONLYOFFICE_SECRET')` throws. `OnlyofficeService.verifyFileToken` must return `null` without exposing the lookup error, while the existing controller behavior and coverage remain unchanged.

## Work unit

Deliver one direct-service strict-TDD work unit:

1. **RED:** Add a focused service regression that makes `ConfigService.get('ONLYOFFICE_SECRET')` throw and captures the current behavior: `verifyFileToken` throws instead of returning `null`.
2. **GREEN:** Add the minimal production catch by bringing the secret lookup inside the verifier's guarded failure boundary, or an equivalent narrow normalization. The direct verifier must return `null`.
3. **Service boundary:** Assert that the direct verifier returns `null` and that the service-level downstream collaborators remain unused through the existing `expectNoDownstreamWork` fixture assertion.
4. **No expansion:** Keep all other token, callback, route, authorization, configuration, persistence, and file behaviors unchanged.

The complete implementation-and-service-regression work unit must stay below 60 changed lines. Existing controller coverage is safety-net coverage only; no new controller test is required, and controller production behavior must not change.

## Scope

### In scope

- Fresh RED coverage in the service spec for a throwing `ConfigService.get('ONLYOFFICE_SECRET')` during `verifyFileToken`.
- Minimal fail-closed handling in `OnlyofficeService.verifyFileToken`/its private verification path.
- GREEN assertion that the direct verifier returns `null` without rethrowing or exposing the lookup error.
- Service-level no-downstream assertions using the existing fixture and helper.

### Out of scope

- A controller regression or any new controller test; existing controller coverage is safety-net only.
- Other authentication or callback matrices.
- Valid, missing, malformed, or alternate secret values.
- Changes to routes, Prisma, configuration, generated output, or unrelated pending files.
- Refactoring authentication helpers or changing the generic unauthorized response.

## Affected areas

- `src/onlyoffice/onlyoffice.service.ts`
- `src/onlyoffice/onlyoffice.service.spec.ts`

`src/onlyoffice/onlyoffice.controller.spec.ts` is not an affected file: its existing coverage remains a safety net, and no new controller test is required. The controller production file remains unchanged.

## Risks and mitigations

- **Risk:** Catching too broadly could hide unrelated verifier defects. **Mitigation:** Guard only the secret lookup and existing token-verification failure path, with the throwing-getter regression as the boundary.
- **Risk:** The fix could alter successful or other authentication behavior. **Mitigation:** Keep the edit narrow, reuse the existing service fixture, and explicitly exclude all other authentication cases from this work unit.
- **Risk:** Service-level assertions could fail to prove the verifier stops downstream work. **Mitigation:** Reuse `expectNoDownstreamWork(context)` so the existing Prisma, filesystem, storage, transaction, and fetch mocks are checked without adding controller coverage.

## Rollback

Revert the service guard and the focused service regression together. No controller, schema, configuration, route, persistence, or generated-file rollback is required.

## Success criteria

- A throwing `ConfigService.get('ONLYOFFICE_SECRET')` is captured as fresh RED through direct `verifyFileToken` before the production change.
- After GREEN, `verifyFileToken` returns `null` rather than throwing or exposing the lookup error.
- Service-level no-downstream assertions pass for the throwing-getter case.
- Only the two affected service files are changed, with fewer than 60 implementation-and-regression changed lines and no other authentication behavior altered.
- Existing controller coverage remains safety-net only; no new controller test is added and controller production behavior remains unchanged.
