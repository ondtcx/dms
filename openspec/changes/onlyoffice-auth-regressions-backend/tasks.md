# Tasks: Restore OnlyOffice Authentication Regression Evidence

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 110–175 (hard stop before 200) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR; stop and ask before reaching 200 lines |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Scope and exact edit surface

Apply may edit only these paths:

1. `src/onlyoffice/onlyoffice.service.spec.ts`
2. `src/onlyoffice/onlyoffice.controller.spec.ts`
3. `openspec/changes/onlyoffice-auth-regressions-backend/apply-progress.md`
4. `openspec/changes/onlyoffice-auth-regressions-backend/tasks.md` (only to maintain task status/evidence references)

Do not edit production source, configuration, Prisma/schema/migrations, dependencies, generated files, storage/document services, unrelated pending files, or any upstream, cleanup, concurrency, deployment, or API redesign surface. Do not run `npm run lint`; apply must use only the scoped ESLint command specified below. This planning phase runs no commands and changes no source or test files.

## Dependencies and gates

- Work units are ordered 1 → 2 → 3 → 4 → 5. Unit 2 depends on the service fixtures and verifier seam from Unit 1; Unit 3 depends on the shared token/observation helpers; Unit 4 depends on the controller fixtures; Unit 5 depends on all preceding changes.
- Reuse the existing mocks and fixtures in the two OnlyOffice specs. Parameterize variants, but retain case-specific assertions for accepted inputs, rejection shape, verifier options, delegation, and no-call effects.
- Record evidence in `apply-progress.md` as 20 concrete marker rows: five units × `RED`, `GREEN`, `TRIANGULATE`, and `SAFETY-NET`. Every row must name its cases and its result; aggregate suite prose is not evidence.
- If a test reveals a production defect or a required behavior change, preserve the RED evidence, mark the unit blocked, and stop. Do not modify production behavior.
- Measure additions plus deletions after each unit. At 200 changed lines, hard-stop, defer lower-value duplicate cases, and request the explicit `ask-on-risk` decision. Never infer `size:exception` or choose a chain strategy.

## Ordered strict-TDD work units

### Unit 1 — Transport and JWT verification boundary

- [x] RED: Add focused failing cases in `src/onlyoffice/onlyoffice.service.spec.ts` for header-only, body-only, matching dual-token, mismatched dual-token, malformed/empty/padded/non-string/wrong-scheme transport, missing/undefined/blank secrets, malformed/expired/not-before/unsigned/wrong-algorithm JWTs, and rejected-path no-call observations; capture the first failure signal in `apply-progress.md` marker rows. <!-- sdd-owner: implementation -->
- [x] GREEN: Implement only the service-spec fixtures and assertions needed to make Unit 1 pass, including a delegating JWT verifier spy and explicit `{ algorithms: ['HS256'] }` option assertion; verify with `npm run test -- onlyoffice/onlyoffice.service.spec.ts`. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: In `apply-progress.md`, record concrete verifier secret trimming/guard behavior, HS256 options, normal time-claim rejection, exact `{ error: 1 }` results, and absence of applicable fetch/file/Prisma/write/update calls for each rejected case. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: Before Unit 1 edits, capture the unaffected focused service-suite result; after Unit 1, rerun `npm run test -- onlyoffice/onlyoffice.service.spec.ts` and record both results without claiming unrun evidence. <!-- sdd-owner: implementation -->

**Unit 1 finish/rollback boundary:** Finish when the transport/JWT matrix and its four evidence rows are attributable and focused service tests pass. Roll back only Unit 1 additions and its receipt rows if needed; preserve production and unrelated files.

### Unit 2 — Verified claims, binding, and no mutation

- [x] RED: Add failing service cases for direct and nested plain-object claims, primitive/array/malformed envelopes, route-key/document mismatches, body-versus-claim disagreement, unsupported status, and status-2 claims missing signed URL/user identity; include resettable downstream no-mutation assertions and capture failures. <!-- sdd-owner: implementation -->
- [x] GREEN: Complete only `src/onlyoffice/onlyoffice.service.spec.ts` changes for verified claim normalization and binding evidence; verify with `npm run test -- onlyoffice/onlyoffice.service.spec.ts`. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Record verified claim source (direct or signed `payload`), route/body comparison, status handling, exact safe response, and applicable no-call observations for fetch, Prisma, stream, file, version, audit, and document-update mocks. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: Record the independently captured Unit 1 focused pass as the pre-change safety net, then record the post-Unit 2 focused service pass in the four Unit 2 marker rows. <!-- sdd-owner: implementation -->

**Unit 2 finish/rollback boundary:** Finish when all claim and binding cases pass without downstream work on rejection. Roll back only Unit 2 test/receipt additions if needed.

### Unit 3 — File-token delegation and stream safety

- [x] RED: Add failing service and controller cases in the existing OnlyOffice specs for valid route-bound file tokens, wrong-route/malformed/expired/unsigned/wrong-algorithm tokens, missing or blank generation secrets, valid stream behavior, unknown documents, and missing latest versions without path or stream dereference; capture the first failures. <!-- sdd-owner: implementation -->
- [x] GREEN: Add only the minimal fixtures/assertions in `src/onlyoffice/onlyoffice.service.spec.ts` and `src/onlyoffice/onlyoffice.controller.spec.ts`; prove controller delegation occurs before Prisma and verify both focused specs with `npm run test -- onlyoffice/onlyoffice.service.spec.ts` and `npm run test -- onlyoffice/onlyoffice.controller.spec.ts`. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Record file-token verification/delegation arguments, route identity, valid `StreamableFile` contract, missing-state exception, Prisma lookup allowance, and absence of `createReadStream`/path access for invalid or missing state. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: Carry forward the Unit 2 focused service result and capture the unaffected controller-suite result before edits; record post-change results separately for both focused specs. <!-- sdd-owner: implementation -->

**Unit 3 finish/rollback boundary:** Finish when token rejection, delegation ordering, valid stream, and missing-state safety are proven. Roll back only Unit 3 spec deltas and receipt rows.

### Unit 4 — Callback forwarding and minimal responses

- [x] RED: Add failing controller cases in `src/onlyoffice/onlyoffice.controller.spec.ts` for exact raw body/authorization forwarding and success/failure/extra-property/exception normalization to HTTP 200 with exactly `{ error: 0 }` or `{ error: 1 }`; capture sensitive-detail leakage or shape failures. <!-- sdd-owner: implementation -->
- [x] GREEN: Complete only controller-spec assertions and response doubles, preserving the existing service contract; verify with `npm run test -- onlyoffice/onlyoffice.controller.spec.ts`. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Record exact forwarded values, HTTP-200 metadata, response body equality, and absence of token, secret, URL, or exception text in the callback response. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: Record the Unit 3 controller focused pass before Unit 4 changes and the post-change focused controller pass in the Unit 4 receipt rows. <!-- sdd-owner: implementation -->

**Unit 4 finish/rollback boundary:** Finish when callback forwarding and non-disclosure are independently demonstrated. Roll back only Unit 4 controller assertions and receipt rows.

### Unit 5 — Budget, regression safety, and final evidence

- [x] RED: Review every Unit 1–4 marker row for a named first failure signal; add no new behavior, and mark any missing or genuine production failure as a blocker before proceeding. <!-- sdd-owner: implementation -->
- [x] GREEN: Update `openspec/changes/onlyoffice-auth-regressions-backend/apply-progress.md` with all 20 concrete evidence rows and measured changed lines; run focused service/controller suites, then `npm test`, then `npm run build`. <!-- sdd-owner: implementation -->
- [x] TRIANGULATE: Perform an exact allowed-surface review and record scoped ESLint only via `npx eslint src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts`; confirm no `npm run lint`, source edits, unrelated files, or sensitive response leakage. <!-- sdd-owner: implementation -->
- [x] SAFETY-NET: Record the independent pre-change focused/full/build/scoped-ESLint baselines where available and the final focused suites, full suite, build, and scoped ESLint results; if any command is unavailable or fails, preserve that evidence and stop rather than broadening scope. <!-- sdd-owner: implementation -->

**Unit 5 finish/rollback boundary:** Finish only below 200 changed lines with all final checks and receipt rows complete. If rollback is required, revert only the two spec deltas and `apply-progress.md`; do not revert unrelated work.

## Verification contract

- Focused: `npm run test -- onlyoffice/onlyoffice.service.spec.ts` and `npm run test -- onlyoffice/onlyoffice.controller.spec.ts`.
- Full: `npm test`.
- Build: `npm run build`.
- Scoped quality: `npx eslint src/onlyoffice/onlyoffice.service.spec.ts src/onlyoffice/onlyoffice.controller.spec.ts` only; explicitly do not run `npm run lint`.
- Review: measure changed lines as additions plus deletions, inspect the exact four allowed paths, and hard-stop before 200 lines. The canonical 400-line review budget remains low risk because this slice is forecast at 110–175 lines.

## Rollback summary

Revert only the added assertions/fixtures in the two existing OnlyOffice spec files and the successor `apply-progress.md` evidence. Preserve existing implementation, prior artifacts, unrelated pending files, and all database/runtime state. A RED indicating a real production defect is a blocker requiring a separate decision, not a rollback trigger for production code.
