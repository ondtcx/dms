# Tasks: Fix PDF Parse v2 Compatibility

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120–220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR; execute work units in order |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add regression coverage before implementation | PR 1 | `npm run test -- src/document/document.service.spec.ts` | N/A: mocked unit boundary | Revert test additions in `src/document/document.service.spec.ts` |
| 2 | Migrate parser lifecycle and preserve fail-soft upload flow | PR 1 | `npm run test -- src/document/document.service.spec.ts` | N/A: no public API change | Revert service changes in `src/document/document.service.ts` |

## Phase 1: Strict TDD RED Tests

- [x] 1.1 Add failing tests in `src/document/document.service.spec.ts` for `PDFParse` construction with equivalent `Uint8Array`, `getText()` invocation, exact non-empty text propagation, and preservation of `''`.
- [x] 1.2 Add failing tests in `src/document/document.service.spec.ts` for constructor rejection, extraction rejection, exactly-once `destroy()` on success/failure, cleanup rejection, error logging, and `null` conversion.
- [x] 1.3 Add failing upload-flow tests in `src/document/document.service.spec.ts` proving PDF preparation continues without extracted text after `null` and still receives successful extracted text.

## Phase 2: Parser Migration GREEN

- [x] 2.1 Update only `src/document/document.service.ts` to use `PDFParse({ data: new Uint8Array(dataBuffer) })`, await `getText()`, and return `result.text`; do not change public APIs or `ThumbnailService`.
- [x] 2.2 Make parser cleanup in `src/document/document.service.ts` execute exactly once in `finally` after successful construction, including rejected extraction paths.

## Phase 3: Cleanup and Fail-Soft Behavior

- [x] 3.1 Preserve error logging and convert construction, extraction, read, and cleanup failures to `null` in `src/document/document.service.ts` without allowing parser errors into upload preparation.
- [x] 3.2 Refactor only the touched extraction boundary in `src/document/document.service.ts`; verify no edits to `src/document/thumbnail.service.ts`, `package.json`, lockfiles, or public service contracts.

## Phase 4: Verification

- [x] 4.1 Run `npm run test -- src/document/document.service.spec.ts` and confirm every v2 lifecycle, empty-text, fail-soft, and upload-continuation scenario passes.
- [x] 4.2 Run the backend build and relevant unit suite; inspect the diff to confirm only `src/document/document.service.ts` and `src/document/document.service.spec.ts` changed.
