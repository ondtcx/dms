# OnlyOffice Authentication Regression Coverage Specification

## Purpose

Restore missing regression evidence for the existing OnlyOffice authentication boundary without changing production behavior or broadening accepted inputs.

## Requirements

### Requirement: Authentication transport variants are covered

The regression suite MUST distinguish supported authorization transport variants and MUST prove that malformed, empty, padded, non-string, wrong-scheme, and mismatched dual-token inputs are rejected while valid header-only, body-only, and matching dual-token inputs retain the existing contract.

#### Scenario: Supported token transports

- GIVEN a request supplies a valid token in the supported header-only, body-only, or matching dual-token form
- WHEN the authentication boundary processes the request
- THEN the existing authenticated behavior is accepted

#### Scenario: Unsafe transport variants

- GIVEN a request supplies an empty, padded, non-string, malformed, wrong-scheme, or mismatched dual-token value
- WHEN the authentication boundary processes the request
- THEN the request is rejected under the existing authentication contract

### Requirement: JWT verification rejects invalid credentials and records algorithm enforcement

The regression suite MUST cover missing, undefined, and blank secrets, malformed, expired, not-before, unsigned, and wrong-algorithm JWTs, and MUST provide evidence that verification enforces the existing HS256 algorithm restriction and normal time-claim validation.

#### Scenario: Invalid secret or token

- GIVEN the configured secret is missing, undefined, or blank, or the token is malformed, expired, not-yet-valid, unsigned, or signed with an unsupported algorithm
- WHEN token verification is attempted
- THEN authentication is rejected and no authenticated request proceeds

#### Scenario: Explicit algorithm guard

- GIVEN a token reaches the JWT verifier
- WHEN verification is observed
- THEN the verifier receives the existing explicit HS256-only option and applies time-claim validation

### Requirement: Verified claims remain route- and status-bound

The regression suite MUST cover valid direct and nested verified-claim shapes, invalid claim shapes, route key/document mismatches, body-versus-claim disagreement, unsupported statuses, and status-2 callbacks lacking signed URL or user identity claims.

#### Scenario: Valid verified claims

- GIVEN the verified claims have the supported shape and agree with the route and request body
- WHEN the authenticated operation is processed
- THEN the operation uses the verified identity and retains the existing success behavior

#### Scenario: Claim or binding mismatch

- GIVEN claims are malformed, nested incorrectly, disagree with the route key or document identity, disagree with the request body, use an unsupported status, or omit required signed status-2 URL/user identity claims
- WHEN the operation is processed
- THEN the request is rejected under the existing contract

### Requirement: File-token delegation and missing-state handling are safe

The regression suite MUST prove that file access delegates token verification through the existing authentication boundary, binds access to the route document identity, rejects invalid file-token variants and missing generation secrets, and rejects unknown documents or missing latest versions before stream dereference.

#### Scenario: Valid file access

- GIVEN a valid file token, matching route document identity, known document, and available latest version
- WHEN the file endpoint processes the request
- THEN the existing stream response contract is returned

#### Scenario: Invalid file state

- GIVEN the file token is invalid, the generation secret is unavailable, the document is unknown, or the latest version is missing
- WHEN the file endpoint processes the request
- THEN access is rejected without dereferencing a missing path or creating a stream

### Requirement: Callback responses are minimal and non-disclosing

The regression suite MUST prove that callback success and failure responses remain HTTP 200 and contain exactly `{ error: 0 }` or `{ error: 1 }`, respectively, without exposing tokens, secrets, URLs, or exception details.

#### Scenario: Callback result normalization

- GIVEN a callback is processed successfully or fails authentication/processing
- WHEN the controller returns the callback response
- THEN the HTTP status is 200 and the body is exactly the corresponding minimal error object with no sensitive diagnostics

### Requirement: Rejected paths prove no mutation or downstream access

The regression suite MUST assert, for applicable rejected authentication and file-state cases, that fetch, Prisma, stream, file, version, audit, and document-update observations do not occur.

#### Scenario: Rejected request has no side effects

- GIVEN authentication, claim binding, file-token, or file-state validation rejects a request
- WHEN the rejection completes
- THEN no applicable downstream retrieval, stream creation, file write, version or audit write, or document update is observed

### Requirement: Task-level strict-TDD evidence and review gate are recorded

The change receipt MUST provide one concrete evidence row for every carried task-level marker. Each row MUST identify its regression cases and record RED failure evidence, GREEN focused command and result, TRIANGULATE observations, and an independently recorded SAFETY-NET result. The test-and-evidence change MUST remain below 200 changed lines; reaching 200 lines MUST pause delivery for an explicit ask-on-risk decision, with no size exception inferred.

#### Scenario: Complete task-level evidence

- GIVEN the successor tasks and their regression cases are implemented and evaluated
- WHEN the apply receipt is reviewed
- THEN every task marker has individually attributable RED, GREEN, TRIANGULATE, and SAFETY-NET evidence rather than aggregate suite prose

#### Scenario: Review-budget gate

- GIVEN the measured additions and deletions reach 200 changed lines
- WHEN the review-budget check is performed
- THEN delivery pauses for the configured ask-on-risk decision and no size exception or unrelated scope is introduced
