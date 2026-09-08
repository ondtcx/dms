# Design: PDF Parse v2 Compatibility

## Technical Approach

Replace only the parser boundary in `DocumentService.extractTextFromPDF`. Use the installed `pdf-parse` v2 named `PDFParse` class, adapt the file `Buffer` to `new Uint8Array(dataBuffer)`, await `getText()`, and return `result.text`. Keep file reading, upload persistence, logging, and the `null` fail-soft contract unchanged. The parser instance is destroyed once in `finally`, including when `getText()` rejects.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Use `PDFParse` v2 with a `Uint8Array` | Matches the installed API and existing local v2 precedent; requires a focused mock | Choose; avoids dependency or lockfile changes |
| Keep callable `pdfParse` usage | Small apparent diff, but fails at runtime with v2 | Reject; confirmed incompatible |
| Downgrade `pdf-parse` | Preserves old call shape but creates dependency drift and diverges from `ThumbnailService` | Reject; explicitly out of scope |
| Return `result.text || null` | Preserves the old truthiness conversion but violates the empty-text scenario | Reject; return `result.text` exactly on successful extraction |

Successful empty text therefore returns `''`; only read, construction, extraction, or cleanup failures return `null`. This preserves the proposal's fail-soft behavior without inventing product behavior. The existing upload flow may still omit a search relation for an empty string because its current `hasSearch` truthiness logic is out of scope.

## Data Flow

```text
PDF path → readFileAsync → Buffer → Uint8Array → PDFParse
                                             ↓
                                       getText().text
                                             ↓
                              upload search/persistence (existing)
```

On any parser-boundary failure, log the error, return `null`, and allow upload preparation to continue without extracted text. Cleanup errors are also logged and converted to the same fail-soft result; cleanup must not escape to the upload flow.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/document/document.service.ts` | Modify | Import `PDFParse`; implement v2 construction, `getText()`, exact text propagation, and once-only `destroy()` cleanup while retaining error logging and `null` fallback. |
| `src/document/document.service.spec.ts` | Modify | Mock the parser boundary and add focused success, empty-text, rejection, cleanup, and upload-continuation regression tests. |
| `src/document/thumbnail.service.ts` | Unchanged | Existing v2 integration is the reference and is explicitly out of scope. |
| `package.json`, lockfile | Unchanged | Use the installed dependency; no version or API changes. |

## Interfaces / Contracts

The public `DocumentService` API is unchanged. The private boundary follows this shape:

```typescript
const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
const result = await parser.getText();
return result.text;
```

The implementation must retain a parser reference only after successful construction, call `destroy()` exactly once in `finally`, and convert cleanup failure to `null` rather than masking fail-soft behavior.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | v2 input and result contract | Mock `pdf-parse`; spy on `PDFParse`, assert `Uint8Array` data, `getText()`, and returned `result.text`. |
| Unit | Empty text and cleanup | Return `{ text: '' }`; assert `''` and one `destroy()` call. Test both successful and rejected extraction paths. |
| Unit | Fail-soft upload behavior | Mock parser rejection (and cleanup rejection), assert logging/`null` and that PDF upload persistence continues without extracted text. |
| Integration/E2E | None required | No public API, persistence schema, or upload behavior is intentionally changed. |

## Threat Matrix

N/A — this change introduces no routing, shell command, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. It only adapts an in-process library API.

## Migration / Rollout

No migration required. Deploy the two source/test changes together; rollback is a source-only revert.

## Open Questions

None.
