# Proposal: Fix PDF Parse v2 Compatibility

## Intent

`DocumentService.extractTextFromPDF` invokes `pdf-parse` as a callable, but the installed v2 API exposes the `PDFParse` class. Migrate this boundary to the supported API while preserving best-effort uploads when extraction fails.

## Scope

### In Scope
- Construct `PDFParse` with the PDF buffer as `Uint8Array` and return `getText().text`.
- Guarantee `destroy()` runs exactly once on successful and failed extraction.
- Preserve error logging and the existing fail-soft `null` return; add focused regression tests.

### Out of Scope
- Changes to `ThumbnailService` or its existing parser integration.
- Dependency version changes, lockfile changes, or public API changes.
- Broader upload, persistence, rendering, or search behavior changes.

## Capabilities

### New Capabilities
- None. This is a compatibility fix with no new user-facing capability.

### Modified Capabilities
- None. Existing fail-soft extraction behavior remains unchanged at the contract level.

## Approach

Update only `extractTextFromPDF` to follow the established v2 lifecycle: instantiate `PDFParse({ data: new Uint8Array(dataBuffer) })`, await `getText()`, return its `text`, and destroy the parser in `finally`. Mock this boundary in focused service tests to cover success, text propagation, cleanup, parser rejection, and upload continuation without extracted text.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/document/document.service.ts` | Modified | Replace the incompatible callable parser usage and retain `null` on errors. |
| `src/document/document.service.spec.ts` | Modified | Add regression coverage for v2 construction, result text, cleanup, and fail-soft errors. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incorrectly reading the v2 result or skipping cleanup could reintroduce failures or leak resources. | Low | Assert `result.text` and `destroy()` on both success and rejection. |
| Parser cleanup could mask extraction errors. | Low | Keep cleanup in `finally` and preserve the existing catch-to-`null` behavior. |

## Rollback Plan

Revert the document-service implementation and regression-test changes. Do not alter dependency metadata, so rollback requires no package or lockfile restoration.

## Dependencies

- Existing `pdf-parse` `^2.4.5` installation and its `PDFParse`, `getText()`, and `destroy()` API.

## Success Criteria

- [ ] PDF extraction uses the v2 class API and returns the `text` field on success.
- [ ] `destroy()` is called exactly once on success and parser failure.
- [ ] Parser errors are logged and return `null` without failing upload preparation.
- [ ] Focused regression tests pass without changes to `ThumbnailService`, dependencies, or public APIs.
