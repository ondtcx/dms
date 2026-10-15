# Exploration: onlyoffice-auth-boundary-backend

## Scope

Planning-only exploration for the first change in the approved stacked-to-main split. Harden only the backend authentication boundaries around the OnlyOffice integration:

- JWT transport extraction for callback requests, including header/body precedence and matching behavior.
- Explicit HS256 verification and route-bound claims.
- File-token delegation and document identity binding.
- Missing, blank, or unsafe secret/version handling with fail-closed behavior.
- Safe callback responses that expose only the existing `{ error: 0 | 1 }` shape.
- The highest-value authentication regression tests in the existing OnlyOffice controller and service specs.

The implementation and focused test diff must remain below the canonical 400 changed-line review budget. Under `ask-on-risk`, work pauses at 400 or more changed lines; no chain strategy or `size:exception` is inferred. No source, test, migration, or configuration changes are made in this exploration.

## Prior evidence

The prior backend review and callback-hardening artifacts establish the following evidence:

- `openspec/changes/review-backend-implementations-backend/explore.md` identified missing callback JWT authenticity checks, unsafe file-token and missing-version boundaries, and unsafe assumptions around missing secrets and callback identities.
- `openspec/changes/onlyoffice-callback-hardening-backend/proposal.md` records the failed verification blockers, including literal escaped-whitespace Bearer parsing, missing explicit HS256 enforcement, file-route verifier bypass, unsafe latest-version dereferencing, and insufficient JWT regressions.
- The existing design at `openspec/changes/onlyoffice-callback-hardening-backend/design.md` defines the bounded direction: strict header/body token extraction, equality for dual transport, non-blank secret enforcement, `algorithms: ['HS256']`, verified claim normalization, route/key binding, file-token reuse of the verifier, and safe callback responses.
- The corresponding specification requires invalid, expired, unsigned, wrong-algorithm, malformed, or mismatched authentication to fail before mutation and requires missing latest versions to fail without unsafe dereference or disclosure.
- Existing project context confirms OpenSpec authority, NestJS/Prisma architecture, strict TDD, English technical artifacts, and a 400-line review budget.

The prior change artifacts and receipt work are preserved evidence. This retry creates no replacement or cleanup artifact outside the requested path.

## Exclusions

This slice excludes:

- OnlyOffice deployment, networking, callback hosting, topology, or secret-distribution redesign.
- Same-origin download policy, redirect handling, MIME/size validation, immutable staging, receipt persistence, concurrency, and filesystem cleanup except where an authentication regression must assert no mutation.
- Broad version-history migration, shared-path rewriting, storage abstractions, dependency changes, or changes to `DocumentService.saveTextContent`.
- API, permissions, workflow, audit-model, or document-subsystem redesign.
- Lower-priority real-PostgreSQL concurrency infrastructure.
- Broad upstream, persistence, or path regression matrices belonging to the separate callback-hardening slice.
- Edits to unrelated pending files, `.pi/`, `.codegraph/`, generated output, or any source/test file during exploration.
- Commits, pull requests, delivery chaining, and `size:exception` approval.

## Risks

- Strict transport and HS256 enforcement may expose deployments that relied on unsigned or differently transported callback data; this boundary intentionally fails closed.
- Requiring a non-blank secret can turn configuration drift into callback/file-token failures, but accepting an absent secret would permit unsafe ambiguity.
- Claim normalization and route binding can reject malformed or legacy payload envelopes; tests must distinguish verified claims from untrusted body fields.
- A missing latest version or unknown file-token document must return a generic safe failure rather than leak document state or throw an array-access error.
- Callback controllers must preserve HTTP 200 and the minimal error object while suppressing JWT, secret, URL, database, and verifier details.
- Authentication-only tests can accidentally pass while mutation paths remain unsafe; rejected cases must assert no fetch, write, version, audit, or document mutation where the existing mocks expose those effects.
- Optional regression coverage can exceed the review budget; parameterized cases in existing specs are preferred, and lower-value cases must be deferred at the gate.

## Under-400-line boundary

The implementation slice is limited to the controller/service authentication surfaces and focused regressions:

1. Extract one strict Bearer header or signed body token; reject malformed or ambiguous supplied headers and mismatched dual transports.
2. Centralize a non-blank-secret JWT verifier with an explicit HS256 allow-list and normal expiration/not-before checks.
3. Accept only verified plain-object claims, bind callback key/document claims to the route, and reject body/claim disagreement without merging unverified fields.
4. Route file-token verification through the same verifier, bind its document claim to the route, and guard absent latest versions before stream creation.
5. Preserve safe callback HTTP 200 responses containing only `{ error: 0 }` or `{ error: 1 }`.
6. Add the highest-value controller/service regressions for transport variants, missing/invalid/expired/wrong-algorithm tokens, claim mismatches, missing secret/version, safe responses, and no mutation.

Keep changes in the existing OnlyOffice files and use shared/parameterized fixtures. Count additions plus deletions before optional tests. At 400 lines, stop and request the configured delivery decision; do not widen into upstream retrieval, persistence, cleanup, or unrelated pending work.

## Readiness

Ready for the next SDD phase as a backend-local authentication boundary slice. The scope is intentionally narrower than the prior callback-hardening design and preserves that prior work as evidence. No implementation or test execution occurred.
