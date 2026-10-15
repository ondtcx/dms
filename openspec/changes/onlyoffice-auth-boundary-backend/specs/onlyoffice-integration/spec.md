# OnlyOffice Authentication Boundary Specification

## Purpose

Define the fail-closed backend authentication boundary for OnlyOffice callbacks and file-token requests. This change covers transport, JWT verification, route binding, safe failures, and focused authentication regressions only; upstream retrieval, persistence, cleanup, deployment, and unrelated modules remain out of scope.

## Requirements

### Requirement: Enforce strict callback JWT transport

The system MUST accept callback authentication through one valid `Authorization: Bearer <token>` header or one non-blank signed body token when no header is supplied. Header parsing MUST apply actual horizontal-whitespace rules and reject leading or trailing whitespace, empty tokens, extra fields, non-Bearer schemes, and ambiguous non-string header values. When both transports are supplied, their token strings MUST match exactly; a malformed supplied header MUST NOT be ignored in favor of the body token.

#### Scenario: Valid transport variants are accepted

- GIVEN a callback has a valid header-only token, body-only token, or equal header and body tokens
- WHEN authentication transport is extracted
- THEN the single selected token MUST be passed to JWT verification

#### Scenario: Invalid or ambiguous transport fails closed

- GIVEN a callback has a malformed, empty, whitespace-padded, extra-field, wrong-scheme, ambiguous, or mismatched transport
- WHEN authentication transport is extracted
- THEN authentication MUST fail before callback processing or mutation

### Requirement: Verify JWTs with a configured HS256 secret and normal time claims

The system MUST require `ONLYOFFICE_SECRET` to be a string containing non-blank content before invoking JWT verification. Callback and file-token verification MUST use one shared verifier with an explicit `HS256` algorithm allow-list and MUST retain normal `exp` and `nbf` validation. Unsigned, malformed, expired, not-yet-valid, and disallowed-algorithm tokens MUST fail safely without decode-only or algorithm-negotiation fallback.

#### Scenario: Valid HS256 authentication succeeds

- GIVEN a token is signed with HS256 using a present, non-blank configured secret and has valid time claims
- WHEN callback or file-token authentication runs
- THEN the verifier MUST accept the token and expose only its verified claims

#### Scenario: Secret or JWT validation failure is rejected

- GIVEN the secret is missing or blank, or the token is malformed, unsigned, expired, not-yet-valid, or uses an algorithm other than HS256
- WHEN authentication runs
- THEN verification MUST fail in a controlled manner before downstream work

### Requirement: Authorize only verified, route-bound claims

The system MUST accept only a verified non-array object, including a supported plain-object `payload` envelope when applicable, as claims. It MUST validate the supported integer status, bind the verified key/document identity to the route document ID, and for status `2` require the signed callback URL and reported user values needed by the existing flow. Body fields MUST NOT be merged into verified claims. Supplied body identity, status, URL, or user fields MUST agree with verified claims or the request MUST fail closed.

#### Scenario: Matching verified claims authorize callback processing

- GIVEN verified claims contain a supported status and a document key/identity matching the route
- AND a status-2 callback contains the required signed URL and reported user values
- WHEN the callback is processed
- THEN it MAY proceed to the existing downstream validation flow

#### Scenario: Untrusted or mismatched claims cannot authorize work

- GIVEN claims are an array, have unsupported status, disagree with the route, or conflict with supplied body fields
- WHEN the callback is processed
- THEN it MUST fail before fetch, file, version, audit, or document mutation

### Requirement: Apply the shared verifier and route safety to file tokens

The file route MUST delegate token verification to the service boundary. `verifyFileToken` MUST use the shared non-blank-secret HS256 verifier and require the verified document claim to equal the requested route document ID. File-token generation MUST fail safely when the configured secret is missing or blank while preserving its existing signing purpose and expiry. A missing document or latest version MUST be detected before path, MIME, or stream dereference and MUST return the existing generic file failure behavior.

#### Scenario: Valid file token serves only its bound route

- GIVEN a valid HS256 file token has a verified document claim matching the requested document and a latest version exists
- WHEN the file route is requested
- THEN the route MAY return the existing file response contract

#### Scenario: Invalid file boundary fails without unsafe dereference

- GIVEN a file token is invalid, expired, wrong-algorithm, secretless, or bound to another document, or the document/latest version is absent
- WHEN the file route is requested
- THEN it MUST return a generic failure without exposing state or dereferencing an absent version

### Requirement: Preserve safe callback responses

The callback MUST continue returning HTTP 200 with exactly `{ "error": 0 }` for accepted acknowledgements or `{ "error": 1 }` for failures. Authentication, claim, configuration, route, file-version, JWT, token, secret, URL, database, verifier, and exception details MUST NOT be exposed in the response. Supported non-status-2 acknowledgements MUST remain available only after the required authentication boundary and MUST NOT cause version mutation.

#### Scenario: Authentication failures use the minimal public contract

- GIVEN callback authentication or claim validation fails
- WHEN the callback returns
- THEN the response MUST be HTTP 200 with only `{ "error": 1 }`
- AND no downstream fetch or mutation MUST occur

#### Scenario: Authenticated acknowledgement preserves compatibility

- GIVEN a callback passes authentication and reports a supported non-status-2 acknowledgement
- WHEN it is processed
- THEN the response MUST be HTTP 200 with only `{ "error": 0 }` and MUST create no version or audit event

### Requirement: Provide focused authentication regressions within the review gate

The existing OnlyOffice controller and service specs MUST cover the highest-value transport, HS256/expiry, claim-binding, file-token delegation, missing-secret, missing-version, safe-response, and no-mutation cases, using shared or parameterized fixtures where practical. The implementation and test changes MUST remain below 400 changed lines; work MUST pause under `ask-on-risk` if the concrete diff reaches the gate. Task-level RED, GREEN, TRIANGULATE, and SAFETY-NET evidence MUST be recorded during implementation.

#### Scenario: Focused regressions observe boundary behavior

- GIVEN the focused controller and service regressions exercise valid and invalid authentication cases
- WHEN the suite runs
- THEN it MUST observe the public response shape, verifier options and delegation, route binding, and absence of fetch/file/version/audit/document mutation on rejected requests

#### Scenario: Review workload remains bounded

- GIVEN implementation and regression additions plus deletions reach 400 changed lines
- WHEN the review-budget gate is identified
- THEN work MUST pause for the configured delivery decision
- AND no chain strategy or `size:exception` approval MAY be inferred
