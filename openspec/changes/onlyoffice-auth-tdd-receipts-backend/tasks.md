# Tasks: OnlyOffice Auth TDD Receipts Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 25–45 lines across the existing service spec and this change's apply receipt |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Scope and hard gates

- Authorized edit surfaces are limited to `src/onlyoffice/onlyoffice.service.spec.ts`, `openspec/changes/onlyoffice-auth-tdd-receipts-backend/apply-progress.md`, and this `tasks.md` artifact.
- Do not edit production source, controllers, configuration, schema, dependencies, generated files, unrelated tests, or unrelated OpenSpec artifacts. Do not create a commit.
- Additions plus deletions across the authorized implementation and receipt surfaces MUST remain strictly below 60 lines. At 60 or more, stop and request the configured `ask-on-risk` decision; do not infer a chain strategy or exception.
- Historical RED is unavailable and MUST NOT be reconstructed, inferred, or reused from earlier changes.
- Commands are forbidden during task authoring; apply/verify own command execution and receipt capture.

## One ordered strict-TDD work unit

### 1. RED — capture an honest fresh failure before the final assertion

- [x] Isolate a new test in `src/onlyoffice/onlyoffice.service.spec.ts` for a valid HS256 token signed with `secret.trim()`, claims `{ status: 1, key: 'doc_7_save_1' }`, and `handleCallback(42, { token })`; reset mocks immediately after `createService()` and immediately before invocation, and add only the first intended-boundary assertion. Capture the actual failing assertion and command output in `openspec/changes/onlyoffice-auth-tdd-receipts-backend/apply-progress.md` before adding the final `{ error: 1 }` assertion or any production implementation. Use the focused command `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts -t "valid signature cannot authorize another route document"`. If the current production behavior already satisfies the intended boundary and this command cannot honestly produce a fresh RED, stop immediately, leave the spec unchanged, record `RED: unavailable` and the reason in the apply receipt, and report the blocked TDD gate; never fabricate a failure or use a deliberately false expectation. <!-- sdd-owner: implementation -->

### 2. GREEN — add the final route-authorization and safety assertions

- [ ] Only if an honest RED receipt exists, add the final `resolves.toEqual({ error: 1 })` assertion to the isolated case in `src/onlyoffice/onlyoffice.service.spec.ts`, followed immediately by `expectNoDownstreamWork(context)`; retain the valid signature, document-7 claim, route-42 invocation, both mock resets, and the existing helper coverage for fetch, filesystem writes, Prisma lookup/transaction, storage/path/move/delete/hash collaborators, `$queryRawUnsafe`, and every exposed transaction delegate. Run the same focused command and record its passing GREEN output after the assertion is present. <!-- sdd-owner: implementation -->

### 3. TRIANGULATE — verify scope, safety, and review budget

- [x] In `openspec/changes/onlyoffice-auth-tdd-receipts-backend/apply-progress.md`, record only current apply-owned RED/GREEN observations and the commands actually run; distinguish unavailable RED from any later GREEN or verification evidence, and confirm no production behavior was changed. <!-- sdd-owner: implementation -->

- [ ] Verify the focused service spec with `npm run test -- src/onlyoffice/onlyoffice.service.spec.ts`, the full unit suite with `npm test`, the build with `npm run build`, and the scoped lint check with `npx eslint src/onlyoffice/onlyoffice.service.spec.ts --no-fix`; record each result in `apply-progress.md` and stop on any failure. <!-- sdd-owner: implementation -->

- [ ] Review the diff and changed-file list, confirm the exact edit surfaces, and measure additions plus deletions; proceed only while the total remains strictly below 60 lines, otherwise stop for `ask-on-risk`. <!-- sdd-owner: implementation -->

### 4. REFACTOR — preserve the bounded evidence unit

- [ ] If cleanup is necessary after GREEN, make only behavior-preserving edits in the authorized service spec or apply receipt, rerun the focused test and the under-60-line measurement, and preserve the captured command output and RED-before-GREEN ordering; if RED was unavailable, make no implementation edit and report the blocked gate. <!-- sdd-owner: implementation -->

## Completion and rollback

Completion requires an honest command-captured RED before the final assertion and a subsequent focused GREEN, or an explicit apply stop stating that current production already satisfies the behavior and fresh RED is unavailable. Rollback removes only the isolated regression and this change's apply receipt; production and unrelated work remain untouched.
