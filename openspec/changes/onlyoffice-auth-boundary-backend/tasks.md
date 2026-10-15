# Tasks: OnlyOffice Authentication Boundary Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 135–220 changed lines across four existing files |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR; the later stacked change handles upstream/cleanup concerns |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Scope and exact edit surface

Apply may edit exactly these four files and no others:

1. `src/onlyoffice/onlyoffice.service.ts`
2. `src/onlyoffice/onlyoffice.controller.ts`
3. `src/onlyoffice/onlyoffice.service.spec.ts`
4. `src/onlyoffice/onlyoffice.controller.spec.ts`

Do not edit schemas, migrations, dependencies, lockfiles, configuration, generated output, storage/document services, modules, or unrelated pending files. Do not run `npm run lint`; it uses `--fix` and can modify unrelated files. Use only the scoped ESLint command specified in verification.

## Ordered strict-TDD work units

### Work unit 1 — Establish service transport and shared JWT boundary

**Dependencies:** None. **Edit surface:** `src/onlyoffice/onlyoffice.service.spec.ts`, `src/onlyoffice/onlyoffice.service.ts`.

- [x] RED: add parameterized service regressions for header-only, body-only, equal dual-token, mismatched dual-token, malformed/ambiguous header, wrong scheme, empty or padded transport, non-string header, missing secret, blank secret, malformed/expired/not-before/unsigned/wrong-algorithm JWTs, and explicit `{ algorithms: ['HS256'] }` verification; assert rejected cases perform no downstream fetch or mutation. <!-- sdd-owner: implementation -->
- [x] GREEN: implement strict raw transport extraction, non-blank configured-secret guarding, one shared HS256 verifier with normal time checks, and safe null/failure results without decode or unverified fallback. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: verify valid HS256 header/body variants select exactly one token, invalid transports fail before service work, and the verifier spy observes the explicit algorithm allow-list and trimmed secret only. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: run the focused service spec and preserve existing service health/blank-document coverage; record RED, GREEN, TRIANGULATE, and SAFETY-NET evidence in the apply/verify receipt. <!-- sdd-owner: implementation -->

### Work unit 2 — Bind verified callback claims and preserve no-mutation behavior

**Dependencies:** Work unit 1. **Edit surface:** `src/onlyoffice/onlyoffice.service.spec.ts`, `src/onlyoffice/onlyoffice.service.ts`.

- [x] RED: add parameterized tests for direct and nested plain-object claims, malformed envelopes, arrays/primitives, supported and unsupported statuses, route key/document mismatches, body/claim disagreement, and missing status-2 URL/user claims; assert `{ error: 1 }` and no fetch, file write, storage move, version/audit write, or document update. <!-- sdd-owner: implementation -->
- [x] GREEN: normalize only verified plain-object claims, validate supported status and route-bound key/document identity, compare supplied body fields without merging them, require signed status-2 identity fields, and retain authenticated non-status-2 acknowledgement behavior. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: prove matching verified claims authorize only the existing bounded flow, mismatches cannot enter downstream work, and status-2 requirements are sourced from signed claims rather than body fallbacks. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: rerun the focused service spec, confirm prior valid-path assertions remain green, and record task-level RED/GREEN/TRIANGULATE/SAFETY-NET evidence. <!-- sdd-owner: implementation -->

### Work unit 3 — Delegate file-token verification and guard file state

**Dependencies:** Work unit 1; Work unit 2 for shared claim normalization. **Edit surface:** `src/onlyoffice/onlyoffice.controller.ts`, `src/onlyoffice/onlyoffice.service.ts`, `src/onlyoffice/onlyoffice.controller.spec.ts`, `src/onlyoffice/onlyoffice.service.spec.ts`.

- [x] RED: add service tests for valid, mismatched, invalid, expired, wrong-algorithm, and secretless file tokens plus missing/blank-secret generation; add controller tests proving `(token, documentId)` delegation, null-verifier rejection before Prisma access, missing document/empty versions rejection, and no stream dereference. <!-- sdd-owner: implementation -->
- [x] GREEN: route `getFile` through `verifyFileToken(token, documentId)`, reuse the shared verifier and route-bound document claim, guard generation secrets, and check document/latest version before path, MIME, or stream access while preserving existing file responses. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: verify direct controller JWT/secret handling is gone, invalid file boundaries stop before Prisma/stream work, valid bound tokens retain the existing stream contract, and absent latest versions produce the generic failure. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: run both focused OnlyOffice specs and inspect the diff to confirm only the four-file edit surface changed. <!-- sdd-owner: implementation -->

### Work unit 4 — Normalize callback responses and raw controller forwarding

**Dependencies:** Work units 1–3. **Edit surface:** `src/onlyoffice/onlyoffice.controller.ts`, `src/onlyoffice/onlyoffice.controller.spec.ts`.

- [x] RED: add controller regressions for exact raw authorization/body forwarding, HTTP 200 callback behavior, extra service-result properties, thrown service errors, and accepted/rejected output shapes containing only `{ error: 0 }` or `{ error: 1 }`. <!-- sdd-owner: implementation -->
- [x] GREEN: forward raw request values once, preserve the callback response status contract, normalize all service results to the minimal public object, and map exceptions to `{ error: 1 }` without diagnostic disclosure. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: verify callback failures cannot leak token, secret, URL, verifier, database, filesystem, or exception details and authenticated non-status-2 acknowledgements remain non-mutating. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: run the focused controller spec and record task-level strict-TDD evidence before the aggregate checks. <!-- sdd-owner: implementation -->

### Work unit 5 — Review-budget gate and bounded verification

**Dependencies:** Work units 1–4. **Edit surface:** no additional files; inspect the four exact implementation/test files only.

- [x] RED: before optional cases, measure additions plus deletions and confirm the forecast remains 135–220 changed lines; if the concrete diff reaches 400 lines, stop and request the configured `ask-on-risk` delivery decision without selecting a chain strategy or size exception. <!-- sdd-owner: implementation -->
- [x] GREEN: retain only high-value parameterized authentication regressions needed for the stated requirements and remove/defer lower-value cases that threaten the review budget. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: review changed paths and behavior against the spec/design exclusions, confirming no source/test/configuration file outside the four-file surface was touched and no cleanup/upstream/persistence work entered the slice. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: run focused specs (`npm run test -- src/onlyoffice/onlyoffice.service.spec.ts` and `npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts`), then the full suite (`npm test`), build (`npm run build`), and scoped ESLint only on the four changed files (for example `npx eslint src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts`); explicitly do not run `npm run lint` because it auto-fixes unrelated files. <!-- sdd-owner: implementation -->

## Dependencies, rollback, and delivery gate

- Work units are sequential: service authentication precedes claim binding, file delegation, and controller response normalization; verification is last.
- Rollback is a source-only revert limited to the same four files. It requires no migration, receipt cleanup, file deletion, version rewrite, or unrelated working-tree reset.
- If compatibility fails, use a forward correction that preserves non-blank-secret enforcement, explicit HS256, normal expiry/not-before checks, verified-only claims, exact transport matching, and route binding; do not restore unsigned or unbound fallbacks.
- The first stacked change targets `main`; upstream/cleanup belongs to the later stacked change and is not a dependency for this work.
- At 400 or more changed lines, pause under `ask-on-risk` and obtain the delivery decision. No chain strategy or `size:exception` approval is inferred.
