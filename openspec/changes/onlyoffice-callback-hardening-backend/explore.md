# Exploration: onlyoffice-callback-hardening-backend

## Scope
Planning-only remediation of the OnlyOffice backend boundaries identified by the prior failed verification. Keep the implementation and focused regression suite strictly below 400 changed lines (additions plus deletions); pause under `ask-on-risk` if the concrete diff reaches or exceeds 400 lines.

## Evidence from prior verification
The failed report (`openspec/changes/review-backend-implementations-backend/verify-report.md`, evidence revision `sha256:2f8108f4ee37e68aa5a18fbb998fa4298eaa82e23317e8e10087679d0ec893e6`) records seven blockers. This remediation is limited to the highest-value backend security, upstream, cleanup, and regression gaps; passing existing tests and build did not clear those contracts.

## Findings and bounded direction

- **Bearer JWT/file-token safety:** Replace literal escaped-whitespace Bearer parsing with strict header extraction; require a configured secret; verify callback and file tokens with an explicit HS256 allow-list; bind file-token document identity to the route; fail safely for missing latest versions. Callback authentication must not trust unsigned body fields or expose token/secret/error details.
- **Upstream redirect/content/stream validation:** Validate configured and callback URLs as credential-free HTTP(S) URLs on the configured OnlyOffice origin. Follow only a bounded number of same-origin redirects. Require 2xx responses, reject explicit incompatible content types, enforce the maximum while streaming (not only through `Content-Length`), and reject empty binary content while allowing valid empty text content.
- **Duplicate/orphan cleanup:** Stage uniquely without overwriting referenced history. Ensure every temp/final candidate is cleaned on validation, duplicate, filesystem, or transaction failure; delete final candidates only after confirming no version references them. Handle receipt uniqueness as an authenticated duplicate without leaving an orphan. Keep receipt/version/document/audit persistence transactional and serialized for one document.
- **Highest-value regression tests:** Keep tests in the existing OnlyOffice specs. Cover header-only, body-only, matching/mismatched dual Bearer transport; missing/invalid/expired/wrong-algorithm JWTs and route/claim mismatches; missing-version and unknown-user fail-closed behavior; non-2xx, foreign/credentialed/fragment URLs, foreign redirects, timeout, oversized streamed data, incompatible type, empty binary, and valid text responses; unique immutable paths and preserved prior bytes; duplicate cleanup, transaction rollback cleanup, and receipt/audit/version effects. Use normalized, separator-aware path assertions. Record task-level RED/GREEN/TRIANGULATE/SAFETY-NET evidence where strict TDD requires it.

## Exclusions
Do not edit unrelated pending `.gitignore` or `src/settings/settings.service.ts`; do not include `.pi/.codegraph` runtime state. Exclude OnlyOffice deployment redesign, broad historical migration or rewriting of shared-path versions, `DocumentService.saveTextContent` behavior, new storage abstractions or dependencies, broad API redesign, and lower-priority real-PostgreSQL concurrency expansion. No commit is part of this phase.

## Risks
Fail-closed JWT enforcement may expose deployment/configuration incompatibility. Redirect and MIME rules can reject unusual but legitimate OnlyOffice responses. Filesystem cleanup is non-transactional; an orphan that cannot be proven unreferenced must remain for safe operational cleanup. Tightening tests and implementation together can exceed the review boundary, so optional coverage must be deferred rather than silently crossing 400 lines.

## Readiness
Ready for proposal and implementation planning as one backend-local, security-focused slice. The delivery gate remains `ask-on-risk`; no chain strategy or `size:exception` is authorized by inference.
