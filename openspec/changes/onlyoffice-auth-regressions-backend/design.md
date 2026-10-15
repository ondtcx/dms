# Design: Restore OnlyOffice Authentication Regression Evidence

## Outcome

Add focused regression assertions and task-level evidence for the existing OnlyOffice authentication boundary. Production behavior remains unchanged: no source file, API contract, persistence behavior, or accepted-input rule is modified. The implementation phase edits only the two existing OnlyOffice spec files and the successor apply receipt.

The tests must independently prove transport parsing, shared JWT verification, verified claim binding, file-token delegation, safe stream handling, minimal callback responses, and rejected-path no-mutation behavior.

## Decisions at a glance

| Concern | Decision |
|---|---|
| Test surface | Extend only `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts`; record evidence in `apply-progress.md`. |
| Production code | Unchanged. A failing assertion that indicates a real behavior defect is recorded as a blocker, not repaired by broadening production behavior. |
| Shared constants | Use `ROUTE_ID = 42`, `SECRET = 'onlyoffice-secret'`, a route-bound key, and an OnlyOffice URL fixture shared within each existing spec. |
| JWT evidence | Sign direct and nested claims with HS256; generate malformed, expired, not-before, unsigned, and wrong-algorithm tokens; spy on the test-mocked verifier options. |
| Claim source | Exercise direct verified objects and verified plain-object `payload` envelopes; reject primitive, array, and malformed envelope results without body fallback. |
| File access | Mock service verification and Prisma independently in the controller spec; verify the valid stream contract and that invalid/missing state never dereferences a path. |
| No mutation | Use one resettable downstream observation harness and assert all applicable calls are absent on every rejected case. |
| Review gate | Forecast 110–175 changed lines. At 200 changed lines, stop and ask under `ask-on-risk`; do not select chaining or a size exception. |

## Data flow under test

```text
callback body + raw authorization
  -> service transport extraction
  -> configured-secret guard and HS256 jwt.verify
  -> verified claim normalization and body-field comparison
  -> route/status/status-2 identity checks
  -> { error: 0 } acknowledgement or existing status-2 flow

file token + route document ID
  -> controller delegates to service verifier
  -> null rejects before Prisma
  -> verified route-bound token permits document/latest-version lookup
  -> missing latest version rejects before path or stream dereference

callback controller result
  -> service call with raw values
  -> HTTP 200 response
  -> exactly { error: 0 } or { error: 1 }
```

The design observes only existing behavior. It does not add a new helper, change a method signature, alter JWT policy, or change downstream callback processing.

## Resolved service-spec fixtures

Add compact helpers beside the existing authentication describe and reset them in `beforeEach`/`afterEach` without disturbing health or blank-document fixtures.

### Token and claim builders

- `signToken(payload, options)` signs with `SECRET` and defaults to `{ algorithm: 'HS256' }`; the options override supports `expiresIn`, `notBefore`, `algorithm: 'HS384'`, and `algorithm: 'none'` cases.
- `directClaims()` returns `{ status: 1, key: 'doc_42_save_1' }`; `statusTwoClaims()` adds `url: 'http://onlyoffice.test/file'` and `users: ['editor-1']`.
- `nestedClaims()` signs `{ payload: directClaims() }`; malformed envelopes sign `{ payload: 'invalid' }` or `{ payload: [] }`.
- `callbackBody(token, fields)` creates a plain body with `token` and optional fields, allowing exact body/verified-claim disagreement cases.
- Invalid JWT fixtures are the compact string `'not.a.jwt'`, an expired HS256 token, a future-`nbf` HS256 token, an `algorithm: 'none'` token, and an HS384 token signed with the same secret.

Mock `jsonwebtoken` in the existing service spec with a delegating `verify` jest mock backed by the real verifier. This keeps token signing real while making `verify.mock.calls` inspectable. The explicit assertion is `secret.trim()` plus `{ algorithms: ['HS256'] }`; missing or blank secrets assert that the verifier is not called.

### Downstream observation harness

Construct the service with configurable `config.get`, `global.fetch`, `fs.writeFileSync`, and mocks for:

- `prisma.document.findUnique` and `$transaction`;
- transaction receipt creation, row-lock query, transaction document/user lookup, version creation, document update, and access/audit creation;
- `storage.generateStructuredPath`, `getPaths`, `moveFile`, `deleteFile`, and `calculateFileHash`.

`resetObservations()` clears every mock before each case. `expectRejectedWithoutDownstreamWork()` checks the applicable `fetch`, file-write, storage move, Prisma document lookup, version write, audit/access write, and document-update mocks. Authentication, claim, and invalid file-token cases must stop before these calls; a missing document/version case may observe its single lookup but must not observe path access or stream creation.

### Service cases

| Fixture group | Required assertions |
|---|---|
| Transport | Accept header-only, body-only, and equal dual-token inputs. Reject mismatched dual tokens, leading/trailing/extra-field headers, empty or padded body tokens, non-string header/body values, wrong schemes, and malformed bodies. |
| Secret/JWT | Reject missing, `undefined`, and blank secrets; malformed, expired, future-`nbf`, unsigned, and HS384 tokens. A valid token reaches the verifier spy with the explicit HS256 allow-list and normal time validation. |
| Claims | Accept direct and nested plain-object claims. Reject primitive/array results, malformed envelopes, unsupported status, key mismatch, non-integer or mismatched route `documentId`, body/claim disagreement, and status-2 claims missing signed URL or user identity. |
| No mutation | For every rejected transport/JWT/claim case, assert `{ error: 1 }` and the resettable downstream observations remain unused. A supported non-status-2 callback returns `{ error: 0 }` without downstream work. |
| File tokens | Exercise valid route-bound, wrong-route, malformed, expired, unsigned, wrong-algorithm, missing-secret, and blank-secret verification. Exercise `generateFileToken` with valid one-day HS256 signing and missing/blank secret rejection. |

Use status `1` for claim-shape and transport acceptance tests so success proves authentication without entering the existing status-2 persistence path. Use status `2` only where signed URL/user requirements or rejected-path ordering must be observed.

## Resolved controller-spec fixtures

Instantiate `OnlyofficeController` in constructor order: service, document service, Prisma service, configuration service. Mock `fs.createReadStream` through the existing `fs` module factory and return a sentinel stream object for the valid-file case.

- Callback forwarding uses a sentinel raw body and raw authorization value, then asserts the exact same references/values reach `handleCallback` once.
- Callback response tests use a response double with `json`, assert the method metadata remains HTTP 200, and verify exact bodies for service `{ error: 0 }`, extra-property results, invalid results, and thrown exceptions. No token, secret, URL, or exception text may appear.
- File delegation passes `token` and `ROUTE_ID` to `verifyFileToken`. A null result asserts the generic unauthorized error, no Prisma lookup, and no `createReadStream` call.
- The valid-file fixture returns `{ documentId: ROUTE_ID }`, a document with one latest version, and a sentinel stream. Assert `StreamableFile`, MIME/disposition headers, and the requested route identity.
- Missing document and `versions: []` fixtures assert the generic not-found error and no stream creation. These cases may verify the lookup but must not read a missing `path`.

## Evidence and task order

Apply creates a compact receipt with one row for each of five successor work units and each of its four markers (20 rows total). Every row names concrete cases and has separate `RED`, `GREEN`, `TRIANGULATE`, and `SAFETY-NET` fields; aggregate work-unit prose is not sufficient.

1. **Transport and JWT:** transport table, secret guard, invalid JWTs, verifier-option spy, and no-call assertions.
2. **Claims and no mutation:** direct/nested normalization, binding/disagreement/status cases, and downstream call absence.
3. **File-token and stream safety:** service file-token matrix plus controller delegation, valid stream, and missing-version dereference checks.
4. **Callback boundary:** raw forwarding, minimal response normalization, exception masking, and HTTP-200 metadata.
5. **Budget and regression safety:** changed-line measurement, exact-file review, focused suites, full suite, build, and scoped no-fix lint.

For each marker, `RED` records the first focused failure signal (or the predecessor verification blocker when the missing case had no executable assertion), `GREEN` records the exact focused command and result, `TRIANGULATE` records verifier options, delegation, verified claim source, response shape, and no-mutation observations, and `SAFETY-NET` records an independently captured pre-change or unaffected-suite result. No execution evidence is claimed during this design phase. If a new regression exposes a genuine production failure, preserve the failure receipt and stop rather than edit source behavior.

## Exact edit surface and exclusions

| Path | Planned action |
|---|---|
| `src/onlyoffice/onlyoffice.service.spec.ts` | Add parameterized transport/JWT/claim/file-token and no-mutation regressions using resolved fixtures. |
| `src/onlyoffice/onlyoffice.controller.spec.ts` | Add raw-forwarding, safe-response, delegation, valid-stream, and stream-safety regressions. |
| `openspec/changes/onlyoffice-auth-regressions-backend/apply-progress.md` | Add 20 concrete task-marker evidence rows and the measured workload result during apply. |

No production source, schema, migration, dependency, configuration, generated file, storage/document service, unrelated pending file, upstream retrieval behavior, cleanup, concurrency, deployment, or persistence redesign is in scope. No command is run and no source/test file is edited in this design phase.

## Forecast, tradeoffs, and recovery

| Work area | Forecast |
|---|---:|
| Service spec fixtures and regressions | 55–80 |
| Controller spec fixtures and regressions | 25–40 |
| Task-level receipt and workload evidence | 30–55 |
| **Total** | **110–175** |

Parameterization is preferred over one test per token variant, but each table row must retain concrete inputs and relevant no-call assertions. A real PostgreSQL or HTTP integration fixture is rejected because it would enlarge scope without improving this unit-level authentication evidence. Reusing the existing mocks is preferred, but shared setup must not replace case-level assertions.

Rollback is limited to reverting the two added spec deltas and the successor receipt. No data, production code, migration, or unrelated working-tree state requires rollback. At 200 changed lines, pause for the explicit delivery decision and defer lower-value duplicate cases.

## SDD result

status: ready
artifacts:
  design: openspec/changes/onlyoffice-auth-regressions-backend/design.md
next_recommended: tasks
risks:
  - A regression may reveal an existing production defect; record it and stop without changing production behavior.
  - Verifier spies and filesystem mocks must remain module-safe so evidence observes real boundary calls.
  - The required 20 receipt rows can consume the review budget if written as verbose prose.
skill_resolution: fallback-path
