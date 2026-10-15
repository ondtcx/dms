# Tasks: OnlyOffice Callback Hardening Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350–390 changed lines (implementation plus focused regressions) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR; pause and ask if the concrete diff reaches 400 lines |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

The 400-line threshold counts additions plus deletions in the allowed implementation, schema/migration reconciliation, and focused test surfaces. No chain or `size:exception` is authorized by inference; defer optional cases and ask before continuing at the threshold.

## Scope, Dependencies, and Allowed Surfaces

- Work only in `src/onlyoffice/onlyoffice.controller.ts`, `src/onlyoffice/onlyoffice.service.ts`, `src/onlyoffice/onlyoffice.controller.spec.ts`, and `src/onlyoffice/onlyoffice.service.spec.ts`.
- Verify `prisma/schema.prisma` and `prisma/migrations/20261001000000_add_onlyoffice_callback_receipts/migration.sql`; reconcile only if the existing receipt shape demonstrably differs, never rewrite an applied migration or add a second receipt migration.
- Do not edit `src/storage/storage.service.ts`, `src/document/document.service.ts`, `src/onlyoffice/onlyoffice.module.ts`, dependencies, `.gitignore`, `src/settings/settings.service.ts`, deployment files, `.pi/`, `.codegraph/`, or unrelated pending changes.
- Preserve the existing receipt table/rows, immutable historical paths, public callback HTTP 200 shape, and existing health/status/file behavior. Do not change `DocumentService.saveTextContent`, add storage abstractions, or add real-PostgreSQL concurrency infrastructure.
- Dependencies are ordered: receipt-shape verification precedes code work; RED precedes each implementation change; GREEN precedes TRIANGULATE and REFACTOR; the focused suite and diff count precede full verification.

## Ordered Strict-TDD Work Units

### 1. Establish receipt baseline and JWT/file-token boundary

**Allowed files:** `prisma/schema.prisma`, the existing receipt migration only for proven drift, `src/onlyoffice/onlyoffice.service.spec.ts`, `src/onlyoffice/onlyoffice.controller.spec.ts`, `src/onlyoffice/onlyoffice.service.ts`, `src/onlyoffice/onlyoffice.controller.ts`.

- [ ] Verify the existing receipt model, indexes, relation, migration state, and current OnlyOffice fixtures; record any proven drift without changing unrelated files. <!-- sdd-owner: implementation -->
- [ ] RED: add focused tests for strict header/body/equal-dual/mismatched-dual transport, malformed headers, missing or blank secret, HS256-only expiry/algorithm handling, route and claim mismatch, safe failure responses, file-token delegation, and missing latest-version handling. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement one non-blank-secret HS256 verifier, strict transport extraction, verified-claim binding, controller delegation, and fail-closed file-route/latest-version behavior without exposing sensitive details. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: verify rejected authentication causes no fetch, file write, version, audit, or document mutation and that valid callback/file response shapes remain compatible. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: centralize verifier and claim helpers while preserving the allowed surfaces and recording the focused Jest command and result as task evidence. <!-- sdd-owner: implementation -->

**Evidence required:** RED test names and failure output; GREEN focused Jest result; TRIANGULATE mutation and response assertions; REFACTOR focused Jest result plus changed-line count for this unit.

### 2. Harden bounded same-origin upstream retrieval

**Depends on:** Work Unit 1 verified claims and latest-version context.

- [ ] RED: add parameterized service regressions for invalid/credentialed/fragmented/foreign URLs, foreign or looping redirects, the fourth redirect, timeout/network failure, non-2xx status, invalid or oversized content length, streamed overflow, incompatible MIME, empty binary, and valid empty text. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement configured-origin and callback URL validation, three-hop same-origin redirect handling, one bounded timeout, 2xx enforcement, streamed size limits, compatible MIME checks, and empty-content rules with safe `{ error: 1 }` output. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: use a fake streaming reader and assert every upstream rejection occurs before persistence, while valid bounded text/binary fixtures proceed without leaking URL, body, or network details. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: consolidate URL, redirect, stream, MIME, and failure helpers without weakening per-hop validation; record RED/GREEN/TRIANGULATE results and the focused Jest command. <!-- sdd-owner: implementation -->

**Evidence required:** named parameterized RED cases; GREEN focused Jest result; TRIANGULATE no-mutation and safe-response assertions; REFACTOR focused Jest result and changed-line count.

### 3. Preserve immutable storage and reference-safe cleanup

**Depends on:** Work Units 1–2 and the existing storage helper contract.

- [ ] RED: add service regressions for unique temp/final paths, preserved historical bytes/checksums/metadata, duplicate receipt cleanup, transaction rollback cleanup, referenced-file protection, uncertain reference lookup retention, synchronized current version/checksum, and valid audit-user attribution. <!-- sdd-owner: implementation -->
- [ ] GREEN: implement UUID staging and final naming, immutable path checks, reference-checked final deletion, temp cleanup on every failure branch, and the serialized receipt/version/document/audit transaction with authenticated duplicate handling. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: assert normalized separator-aware paths, lock-before-receipt ordering, no duplicate version/audit/current update, rollback of all database writes, and retention of referenced or uncertain candidates. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: keep cleanup safety explicit and local, avoid wildcard/path-pattern deletion, preserve shared-path history, and record the complete focused Jest evidence for this unit. <!-- sdd-owner: implementation -->

**Evidence required:** RED failure names; GREEN focused Jest result; TRIANGULATE transaction ordering, path, cleanup, and identity assertions; REFACTOR focused Jest result and changed-line count.

### 4. Complete controller boundary and existing-behavior regressions

**Depends on:** Work Units 1–3 implementation behavior.

- [ ] RED: extend controller/service tests only where needed to retain health, supported non-status-2 callbacks, valid status-2 acknowledgement, file response shape, safe HTTP 200 responses, and unknown-user rejection without fallback attribution. <!-- sdd-owner: implementation -->
- [ ] GREEN: make the smallest controller boundary adjustments needed to pass raw authorization/body data safely and preserve `{ error: 0 | 1 }` with no sensitive diagnostics. <!-- sdd-owner: implementation -->
- [ ] TRIANGULATE: inspect response bodies and mocked side effects for all rejected boundaries, then run both OnlyOffice specs together to detect cross-fixture regressions. <!-- sdd-owner: implementation -->
- [ ] REFACTOR: parameterize repeated fixtures and remove redundant assertions while keeping all required security, integrity, identity, and path evidence reviewable. <!-- sdd-owner: implementation -->

**Evidence required:** RED/GREEN test names and output; TRIANGULATE combined focused Jest result; REFACTOR combined focused Jest result and final changed-line count.

### 5. Review-budget gate and full verification

**Depends on:** Work Units 1–4 and no optional coverage beyond the forecast.

- [ ] Count additions plus deletions for the allowed diff before optional test additions; if the count is 400 or greater, stop and request the configured ask-on-risk decision without selecting chaining or `size:exception`. <!-- sdd-owner: implementation -->
- [ ] Run focused Jest for `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts`, then run the full Jest suite with `npm test`. <!-- sdd-owner: implementation -->
- [ ] Run `npm run build` and scoped ESLint with `npx eslint src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.spec.ts src/onlyoffice/onlyoffice.service.spec.ts --no-fix`. <!-- sdd-owner: implementation -->
- [ ] Record command, exit status, and relevant test/build/lint evidence; explicitly do not run `npm run lint` because it auto-fixes unrelated files. <!-- sdd-owner: implementation -->
- [ ] Verify rollback readiness: revert only callback source/tests if required, preserve receipt rows, committed versions, audit history, and all referenced files, and leave uncertain orphans for bounded reference-checked operational cleanup. <!-- sdd-owner: implementation -->

**Required verification commands (to run during apply/verify, not this planning phase):**

```text
npm run test -- src/onlyoffice/onlyoffice.service.spec.ts
npm run test -- src/onlyoffice/onlyoffice.controller.spec.ts
npm test
npm run build
npx eslint src/onlyoffice/onlyoffice.controller.ts src/onlyoffice/onlyoffice.service.ts src/onlyoffice/onlyoffice.controller.spec.ts src/onlyoffice/onlyoffice.service.spec.ts --no-fix
```

`npm run lint` is explicitly excluded because it auto-fixes unrelated files.

## Rollback Boundary

Rollback is limited to the callback controller/service and their focused tests. Do not delete immutable files, rewrite historical paths, remove receipt rows, down-migrate after receipts exist, or mix recovery with unrelated working-tree cleanup. A candidate whose reference status cannot be proven remains for bounded operational cleanup.
