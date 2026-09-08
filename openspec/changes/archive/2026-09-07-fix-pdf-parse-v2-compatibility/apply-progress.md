# Apply Progress: Fix PDF Parse v2 Compatibility

## Status

- **Change**: `fix-pdf-parse-v2-compatibility`
- **Mode**: Strict TDD
- **Artifact store**: OpenSpec
- **Delivery**: Auto-chain, stacked-to-main
- **Native attempt**: `sha256:374c532a36dc29010c8707d23167f20267bdd9c54e154bca6f211a5849bcf48e`
- **Scope**: `src/document/document.service.ts`, `src/document/document.service.spec.ts`, and this progress artifact

## Completed Tasks

- [x] 1.1 Added RED coverage for `PDFParse` construction, `Uint8Array` input, `getText()`, exact text propagation, and empty text.
- [x] 1.2 Added RED coverage for read, construction, extraction, and cleanup failures, logging, `null`, and exactly-once destruction.
- [x] 1.3 Added upload continuation coverage for failed and successful extraction.
- [x] 2.1 Migrated `DocumentService` to the `PDFParse` v2 class lifecycle.
- [x] 2.2 Destroyed constructed parsers once in `finally`, including rejected extraction.
- [x] 3.1 Preserved logging and fail-soft `null` behavior for read, construction, extraction, and cleanup failures.
- [x] 3.2 Kept the implementation limited to the extraction boundary and did not modify public APIs, `ThumbnailService`, or dependency metadata.
- [x] 4.1 Focused service tests pass.
- [x] 4.2 Backend build passes and scope was inspected.

## TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | Triangulate | Refactor |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `src/document/document.service.spec.ts` | Unit | 34/34 | Written, then failed against callable API | Passed | Non-empty and empty text cases | Clean |
| 1.2 | `src/document/document.service.spec.ts` | Unit | 34/34 | Written, then failed against callable API | Passed | Read, construction, extraction, and cleanup failures | Clean |
| 1.3 | `src/document/document.service.spec.ts` | Unit | 34/34 | Written before service migration | Passed | Failure and successful upload paths | Clean |
| 2.1 | `src/document/document.service.spec.ts` | Unit | 34/34 | Covered by 1.1 RED | Passed | Input and result assertions | Clean |
| 2.2 | `src/document/document.service.spec.ts` | Unit | 34/34 | Covered by 1.2 RED | Passed | Success and rejected extraction cleanup | Clean |
| 3.1 | `src/document/document.service.spec.ts` | Unit | 34/34 | Covered by 1.2/1.3 RED | Passed | Read, parser, cleanup, and upload fail-soft paths | Clean |
| 3.2 | `src/document/document.service.spec.ts` | Unit | 34/34 | N/A: scoped refactor | Passed | Existing and new cases | Clean |
| 4.1 | `src/document/document.service.spec.ts` | Unit | 34/34 | N/A: verification | 42/42 passed | All 42 focused tests | N/A |
| 4.2 | `src/document/document.service.spec.ts` | Unit/build | N/A: verification | N/A | Focused tests 42/42 and build passed | Scope inspection | N/A |

## Work Unit Evidence

| Work unit | Focused test command and exact result | Runtime harness command/scenario and exact result | Rollback boundary |
|-----------|----------------------------------------|---------------------------------------------------|-------------------|
| 1. Regression coverage and parser migration | `npm run test -- src/document/document.service.spec.ts --runInBand` — exit 0; 1 suite, 42 tests passed | `N/A` — parser and upload boundary are covered with mocked unit tests; no public API or runtime integration changed | Revert additions in `src/document/document.service.spec.ts` and the extraction-boundary changes in `src/document/document.service.ts` |
| 2. Verification | `npm run build` — exit 0; NestJS backend compiled successfully | `N/A` — no public API/runtime boundary introduced by this compatibility fix | Revert the same two scoped source files and this progress artifact |

## Implementation Notes

- `result.text` is returned exactly, so successful empty extraction remains `''`.
- Cleanup errors are logged and convert the result to `null` without escaping into upload preparation.
- No changes were made to `src/document/thumbnail.service.ts`, `package.json`, lockfiles, or public service contracts.
