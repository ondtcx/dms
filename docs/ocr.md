# Prepare offline Spanish PDF search enrichment

The local PDF engine, bounded background service, post-commit mutation hooks and Nest shutdown-hook activation are implemented. OCR runs **best-effort after** a document or version commit; it never blocks or fails the persisted write, and original PDFs and the existing digital extraction service remain unchanged.

## Quick path

From `dms-backend`, using Node 24 (the verified runtime):

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run ocr:setup
npm run build
```

`ocr:setup` is the **explicit model download**. It verifies the compressed source checksum before atomically publishing `ocr-models/spa.traineddata.gz`. It skips the network when that file already has the approved checksum. No application startup or OCR job downloads a model.

For a private synthetic PDF, run the compiled child with absolute local paths:

```sh
node dist/src/document/text-extraction/pdf-ocr.worker.js /absolute/private/input.pdf /absolute/local/ocr-models
```

Windows drive-letter absolute paths are also accepted. The repository's compiler currently nests output under `dist/src/`; confirm the emitted location when changing compiler configuration. A failed build is not a successful deployment even if TypeScript emits some files.

Expected output is one JSON result, either `completed` with `addedText` or `no-enrichment` with a bounded reason. Do not log returned text from real documents. Missing or corrupt models omit enrichment; digital search remains the responsibility of the existing extraction path.

## Offline model and deployment

| Topic | Contract |
|---|---|
| Source | `https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz` |
| Compressed SHA256 | `6cd52c545bceeacb2e43fad64fc0703a711c482ba20d1ca4b6915c09de9973e6` |
| Default model directory | Backend working-directory `ocr-models` at runtime; setup defaults to backend-root `ocr-models` |
| Override | Set `OCR_MODEL_DIRECTORY` to an absolute local directory; send that resolved directory explicitly in child requests |
| Provisioning | HTTPS source only, redirects rejected, 60-second download timeout, 32MiB compressed-byte limit, checksum before exclusive temporary write and atomic rename |
| Interrupted setup | A write/rename failure can leave a uniquely named `.tmp` file in the model directory; it is not a runtime model |
| Runtime | Check the local compressed SHA256 before loading PDF/OCR; explicitly resolve the installed Tesseract worker/core and supply local `langPath`, `gzip: true`, `cacheMethod: 'none'` |
| Trust | Operator-owned model directory must not be modified during jobs; Tesseract rereads the verified local file, not a remote URL |
| Packaging | Model and private temporary files are excluded from Git and Docker build context; provision outside the image, then mount the model directory read-only |

Ship the compiled child **and engine**, installed production dependencies, `pdfjs-dist/legacy/build/pdf.mjs`, PDF.js worker assets, `@napi-rs/canvas`'s platform-native binary, and the installed `tesseract.js`/`tesseract.js-core` JS and WASM assets. Node's Tesseract adapter selects its locally installed SIMD/core variant; its `corePath` option does not override that Node adapter's variant selection. Ignoring installation scripts does not remove the need for the platform-specific optional canvas package. No system OCR executable or WSL is needed.

PDF.js is ESM. The engine uses a fixed, literal native dynamic import preserved across CommonJS compilation; it never evaluates caller-supplied source, module paths, or scripts. Native package loading occurs only when the child runs extraction, not when the parent merely imports protocol/types.

### Licenses and references

The model is distributed by Project Naptha from Tesseract's Spanish trained-data collection. Tesseract and its trained-data repositories use Apache-2.0; preserve the applicable notices with redistributed model assets and confirm upstream provenance before changing the pinned checksum.

- [Project Naptha model source](https://tessdata.projectnaptha.com/4.0.0/spa.traineddata.gz)
- [Tesseract trained-data repository and license](https://github.com/tesseract-ocr/tessdata)
- [Tesseract.js worker options](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
- [PDF.js](https://github.com/mozilla/pdf.js) — Apache-2.0
- [Tesseract.js](https://github.com/naptha/tesseract.js) — Apache-2.0
- [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas) — MIT

Direct engine dependencies are pinned to `pdfjs-dist@5.4.530`, `@napi-rs/canvas@0.1.88`, and `tesseract.js@7.0.0`. Existing `canvas` and other dependencies are preserved.

## Internal job API for post-commit writers

Inject the exported `PdfOcrService` from `TextExtractionModule`. Call `enqueue` only after the document/version transaction commits, without awaiting OCR:

```ts
const admission = pdfOcrService.enqueue({
  documentId: committedDocument.id,
  currentVersion: committedDocument.currentVersion,
  versionRowId: committedVersion.id,
  checksumSHA256: committedVersion.checksumSHA256,
  path: committedVersion.path,
  mimetype: committedVersion.mimetype,
  digitalText: extractedText,
});
```

The checksum must be a non-null SHA256 hex string. `enqueue` returns synchronously as `'accepted'` or `'skipped'`; acceptance is not a publication guarantee. There are no public capacity, timeout, worker-path or model overrides in this API. The hooks are best-effort: a synchronous throw from `enqueue`, a skipped admission or a later OCR failure never changes the already-persisted response.

Wired mutation hooks (each runs strictly **after** a successful commit, never after a rollback):

| Flow | Hook point | Job identity |
|---|---|---|
| Upload (single and batch) | `DocumentService.persistPreparedUploads` post-commit loop, per committed document | Committed version row, document checksum and stored path |
| PDF replacement | `DocumentService.replaceFile` after the version transaction returns | New current version row |
| Version restoration | `DocumentService.restoreVersion` after the version transaction returns | Restored version row |
| Successful OnlyOffice callback | `OnlyofficeService.handleCallback` after the `Serializable` callback transaction returns | New current version row; MIME from the downloaded response |

Non-PDF results are still passed to `enqueue`, which skips them immediately without reserving capacity or touching the filesystem. `app.enableShutdownHooks()` in `main.ts` activates `PdfOcrService.onApplicationShutdown`, so pending jobs are cancelled and the owned child is terminated on process shutdown.

| Safeguard | Runtime behavior |
|---|---|
| Admission | Three total reservations before any filesystem work: one active/preparing and two FIFO pending; unsupported MIME or overflow skips immediately |
| Queue/preparation wait | 120 seconds from admission; expired pending jobs are removed without reading files. Expired preparation retains its reservation until its own handles close and late snapshot cleanup finishes |
| Snapshot | At most 10MiB, regular non-symlink source opened with no-follow where supported; handle identity and SHA256 checked. Child receives only an exclusive snapshot under backend working-directory `.tmp/basic-search-ocr/jobs/job-*` |
| Ownership | Directory mode 0700 and snapshot mode 0600 where supported. Application working directory and its temporary root must be operator-owned. No recursive deletion or sweep of unrelated/previous-run files |
| Child | One adjacent compiled `pdf-ocr.worker.js` via `__dirname`, silent stdout/stderr, IPC only; 60-second deadline and SIGKILL attempt |
| Closure | Malformed, duplicate, oversized or failed IPC invalidates the result. Code-zero **close** is required before publication. Kill failure/unclosed children retain capacity and snapshots; no second child starts |
| Publication | Short transaction locks `Document FOR UPDATE` before querying document/version/search. Check deletion, current version, version row ID, both checksums, MIME and path identity; same-checksum ABA is stale |
| Digital baseline | Read latest search text under the lock, falling back to expected digital text only when absent. Preserve its exact prefix; normalize appended OCR and cap combined UTF8 at 1MiB. Already oversized baselines remain unchanged rather than being truncated |
| Search vector | Only upsert `DocumentSearch.extractedText`; existing database triggers own the vector. No-enrichment/failure never clears text |
| Shutdown | Stop admission, cancel pending/preparing work and kill owned child. Wait at most five seconds; unclosed child/preparation cleanup remains deferred until resource closure. An already executing short publication may finish |
| Durability | No retry, backfill or restart recovery. Abrupt process death can leave an exclusively named snapshot; operators may inspect old job directories when no application instance owns them |

Run the backend with its working directory set to the backend root. Use OS/container memory limits for a hard RSS bound: the child's `--max-old-space-size=256` bounds only V8 heap, not native canvas/WASM allocations. This is process isolation, **not a sandbox** or total-memory guarantee.

### Private child protocol

The service forks the adjacent compiled worker once per admitted job with an IPC channel, then sends exactly one message:

```json
{ "type": "extract", "inputPath": "/absolute/private/snapshot.pdf", "modelDirectory": "/absolute/local/ocr-models" }
```

The child handles one message, sends one result, and exits. Unsupported MIME selection happens in T2; this engine accepts PDF only. Relative, URL, UNC, NUL-containing, excessive-length paths and extra request fields are rejected. Paths refer to a parent-created private snapshot, never a caller-selected original path.

| Result | Meaning |
|---|---|
| `completed` | Nonempty normalized `addedText`; `pagesProcessed`, `pagesOcr`, and `capped` describe the inspected prefix |
| `no-enrichment` | No publishable added text; reasons include `invalid-request`, `invalid-input`, `model-unavailable`, `processing-failed`, `no-added-text` |

**Keep the existing whole-document digital baseline separate and unchanged.** Append bounded enrichment only on a validated `completed` result. Never replace digital text with `addedText`, never truncate the baseline to this engine's byte/page caps, and do not publish anything on no-enrichment/failure. Enrichment includes negligible digital fragments on OCR-selected pages; sufficiently digital pages are not duplicated into `addedText`.

The service validates exact result shape, byte/count bounds and exit behavior, ignores stdout/stderr instead of capturing them, enforces the 60-second child wall-clock deadline, attempts termination, cleans owned snapshots after closure, and rejects stale results before guarded publication. Unexpected termination/malformed IPC means no enrichment. Do not execute this engine in the Nest parent or await OCR inside a database transaction. IPC validation bounds accepted text after Node deserialization; it is not a transport-level hostile-child memory sandbox.

## Bounds and quality

- Read at most 10MiB of private PDF bytes; file size/growth checks reject oversized or changing reads.
- Inspect at most the first 20 pages. OCR only pages with fewer than 30 Unicode letters/digits in their digital text; this heuristic can miss embedded scans on otherwise textual pages.
- Render one page at a time, with a long edge at most 1754 pixels and at most 9 million pixels. Release page, PDF.js and Tesseract resources in `finally` paths.
- Return at most 1MiB of NFC-normalized UTF8 enrichment, with whitespace/control characters normalized and truncation on a code-point boundary. Serialized JSON is bounded at `6 * 1024 * 1024 + 1024` bytes, accounting for escaping.
- V8 heap options do **not** constrain canvas native memory or Tesseract WASM memory. A child process and raster caps are not a sandbox or a total memory guarantee. Initialization failures/hangs trigger the service deadline/termination attempt.
- Synthetic Spanish recognition verifies wiring, not human scan accuracy. Low resolution, handwriting, orientation, tables, mixed languages, and longer PDFs may yield incomplete or incorrect text. No accuracy guarantee or historical backfill is provided.

## Verification checklist

```sh
npm test -- --runInBand src/document/text-extraction/pdf-ocr.engine.spec.ts src/document/text-extraction/pdf-ocr.worker.spec.ts
node --test scripts/provision-ocr-model.spec.mjs
npm test -- --runInBand src/document/text-extraction
npm run build
```

- [ ] The local model has the compressed checksum above.
- [ ] The compiled child recognizes a synthetic Spanish image-only page with network access denied.
- [ ] Digital pages are not rasterized, and the separate baseline is preserved beyond page 20.
- [ ] Missing/corrupt models and malformed IPC produce no enrichment.
- [x] Verify service admission/deadline/publication tests before enabling T3 production hooks.
- [x] T3 enables Nest shutdown hooks and enqueues only committed current versions.
