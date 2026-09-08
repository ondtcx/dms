## Exploration: fix-pdf-parse-v2-compatibility

### Current State
The backend declares `pdf-parse` `^2.4.5`, and the installed lockfile resolution is `2.4.5`. This release exposes a `PDFParse` class rather than the callable parser API expected by the document service. The installed package/runtime contract confirms that `require('pdf-parse')` returns a module object containing `PDFParse`; the returned value is not callable.

`src/document/document.service.ts` currently loads the dependency as `const pdfParse = require('pdf-parse')` and invokes `pdfParse(dataBuffer)` from `extractTextFromPDF`. That is incompatible with `pdf-parse@2.4.5` and produces the `pdfParse is not a function` failure. The method catches parser failures, logs them, and returns `null`, preserving the existing fail-soft contract: PDF upload can continue without extracted/searchable text rather than failing the upload. The method is part of the PDF upload preparation path before persistence.

`src/document/thumbnail.service.ts` already demonstrates the compatible v2 pattern: import `PDFParse`, construct it with `{ data: new Uint8Array(dataBuffer) }`, call the required parser operation, and destroy the parser in `finally`. This is the local lifecycle and compatibility precedent. `getText()` returns a result object whose `text` property must be read; it is not the legacy callable-parser return contract.

The current document-service tests cover upload persistence and cleanup paths, but do not directly verify PDF text extraction, the v2 class construction, successful text propagation, parser destruction, or fail-soft behavior after parser errors. No functional code change is made by this exploration.

### Affected Areas
- `src/document/document.service.ts` — incompatible callable import/invocation in `extractTextFromPDF`; preserve its null-on-error fail-soft behavior while adapting the parser API.
- `src/document/thumbnail.service.ts` — existing compatible `PDFParse` construction and `finally` cleanup pattern; use as the reference and avoid unrelated behavior changes.
- `src/document/document.service.spec.ts` — add focused regression coverage for successful extraction, returned `TextResult.text`, parser cleanup, and extraction errors returning `null`.
- `package.json` — declares the supported `pdf-parse` `^2.4.5` dependency and Jest test command; no dependency downgrade is indicated.
- `package-lock.json` — locks the tested `pdf-parse` resolution to `2.4.5`.
- `node_modules/pdf-parse/package.json` and its v2 declarations — runtime/type evidence for the `PDFParse` class, `getText()`, and `destroy()` lifecycle.

### Approaches
1. **Migrate document extraction to the v2 class API** — replace the callable assumption with `PDFParse`, construct it with the buffer as `Uint8Array`, read `getText().text`, and destroy the parser in `finally`.
   - Pros: Aligns document extraction with the installed dependency and the already-working `ThumbnailService` pattern; removes the confirmed runtime incompatibility; keeps the current dependency and fail-soft upload policy.
   - Cons: Requires focused mocks/tests for the parser boundary and lifecycle; representative PDF behavior should still be validated where practical.
   - Effort: Low

2. **Downgrade or pin `pdf-parse` to a legacy callable release** — retain the current document-service call shape and change dependency metadata.
   - Pros: Smaller application-code change if the legacy package remains suitable.
   - Cons: Preserves an obsolete API assumption, diverges from `ThumbnailService`, introduces dependency/lockfile drift, and requires validating legacy runtime support and security implications.
   - Effort: Medium

### Recommendation
Use Approach 1. The incompatibility is confirmed for `pdf-parse@2.4.5`, and the repository already contains a compatible `PDFParse` integration in `ThumbnailService`. Adapt only document text extraction to that class API, read the returned `text` field, and guarantee parser destruction on success and failure. Preserve fail-soft semantics: successful extraction should provide text for the existing search/persistence path, while parser errors should be logged and return `null` without converting upload into a parser failure.

Required regression tests in `src/document/document.service.spec.ts` (or a narrowly scoped parser seam) are:
- successful extraction constructs `PDFParse` with `new Uint8Array(dataBuffer)`, calls `getText()`, and returns `result.text`;
- successful extraction destroys the parser exactly once;
- parser rejection still destroys the parser and returns `null` without throwing;
- upload behavior preserves the existing optional-search/fail-soft contract, including no extracted text when parsing fails;
- optionally, a minimal integration-style fixture confirms a representative PDF produces text without depending on thumbnail rendering or canvas.

### Risks
- `getText()` returns a `TextResult` object; reading the object itself or assuming the legacy callable result shape would reintroduce incorrect behavior.
- Parser instances must be destroyed on both success and failure; cleanup must not mask the original extraction result/error or turn best-effort parsing into a hard upload failure.
- Existing tests do not provide a real PDF fixture. Unit tests should mock the parser boundary; any fixture-based test should avoid canvas/PDF rendering dependencies used by thumbnails.
- `^2.4.5` permits future compatible-range updates. Tests should assert the supported class API and lifecycle, not only the current module object's keys.
- The backend checkout has no `openspec/config.yaml`; this artifact follows the dispatcher-declared backend path exactly. No repository configuration or functional source is changed.

### Ready for Proposal
Yes — the `pdf-parse@2.4.5`/callable API incompatibility is confirmed, the compatible `ThumbnailService` pattern and fail-soft policy are identified, and the change is bounded to parser usage plus focused regression tests. The proposal should explicitly preserve upload success when extraction fails and keep thumbnail behavior unchanged.
