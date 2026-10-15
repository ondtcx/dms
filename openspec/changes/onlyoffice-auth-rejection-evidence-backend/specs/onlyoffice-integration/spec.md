# OnlyOffice Rejection Evidence Specification

## Purpose

Define a bounded, test-and-evidence-only successor for deterministic OnlyOffice authentication rejection coverage. Production behavior and unrelated test coverage remain unchanged.

## Requirements

### Requirement: Align controller invalid-token matrix arguments

The controller regression suite MUST pass each invalid-file-token matrix invocation the exact `invalid-${label}` token configured by its verifier expectation. Each case MUST retain evidence that verification received that token and that the rejected path reaches its applicable no-Prisma assertion.

#### Scenario: Invalid controller token reaches the intended boundary

- GIVEN an invalid-file-token matrix row identified by `label`
- WHEN the controller invokes the file-token path
- THEN the verifier MUST be called with `invalid-${label}`
- AND the response MUST remain the existing safe failure
- AND the applicable Prisma assertion MUST prove no persistence lookup occurred

### Requirement: Prove rejected service cases make no downstream calls

The service rejection regression suite MUST reset applicable mocks for each rejected case and MUST assert zero calls to every observable downstream collaborator applicable to that path, including fetch, Prisma document/version access, transactions, filesystem or path operations, streams, storage, audit, and document updates.

#### Scenario: Rejected service authentication has no downstream work

- GIVEN a service case rejects authentication or an invalid claim before downstream processing
- WHEN the service returns its safe failure result
- THEN each applicable downstream collaborator MUST have zero calls
- AND the result MUST remain `{ error: 1 }`

### Requirement: Reject invalid file tokens before Prisma access

The service regression suite MUST cover malformed, expired, unsigned, wrong-algorithm, wrong-route, and missing-secret file-token inputs. Every such case MUST reject before Prisma document or version lookup, transaction, or other persistence access; missing-document and missing-version behavior remains outside this requirement.

#### Scenario: Invalid file-token variants stop before persistence

- GIVEN a file token is malformed, expired, unsigned, uses a wrong algorithm, binds to the wrong route, or is presented without a configured secret
- WHEN file-token authentication is evaluated
- THEN the service MUST return the safe failure result
- AND Prisma document/version lookups, transactions, and other persistence calls MUST remain at zero

### Requirement: Preserve unavailable historical RED evidence

The successor evidence MUST record historical RED evidence as unavailable when the prior phase did not capture it. It MUST NOT reconstruct, infer, or fabricate a historical failure from current test results or green evidence.

#### Scenario: Historical evidence status remains explicit

- GIVEN historical RED output is unavailable
- WHEN the successor evidence is recorded
- THEN the RED status MUST be identified as `unavailable`
- AND only evidence captured during the successor phase MAY be recorded as current evidence

### Requirement: Enforce the under-100 changed-line gate

The successor delta MUST remain strictly below 100 changed lines, counting additions and deletions across the two existing test specs and the successor evidence receipt. If the forecast reaches 100 lines or the bound is threatened, work MUST stop for an explicit `ask-on-risk` decision; no size exception, chain strategy, production edit, or unrelated artifact change MAY be inferred.

#### Scenario: Bounded successor remains in scope

- GIVEN the measured successor delta is fewer than 100 changed lines
- WHEN the review gate is evaluated
- THEN work MAY proceed only within the specified test and evidence scope

#### Scenario: Oversized successor pauses delivery

- GIVEN the measured or forecast successor delta reaches 100 changed lines
- WHEN the review gate is evaluated
- THEN work MUST stop and request the configured `ask-on-risk` decision
- AND no alternate delivery strategy or exception MAY be assumed
