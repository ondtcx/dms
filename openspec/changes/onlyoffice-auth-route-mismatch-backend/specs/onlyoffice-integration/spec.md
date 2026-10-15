# OnlyOffice Route-Mismatch Rejection Specification

## Purpose

Define a bounded backend service-test successor that proves a validly authenticated OnlyOffice callback is rejected when its signed document claim does not match the requested route. This specification is limited to test observability and phase-owned evidence; production behavior and unrelated coverage MUST remain unchanged.

## Acceptance Criteria

- The focused service case retains a validly signed token and returns `{ error: 1 }` for the route mismatch.
- Downstream mocks are reset after fixture construction and immediately before invocation, then all applicable collaborators are shown to have zero calls.
- Historical RED evidence is explicitly recorded as `unavailable`; no prior failure is reconstructed or inferred.
- The successor remains strictly below 60 changed lines across the test and phase-owned evidence receipt.

## Requirements

### Requirement: Reject a validly signed route-mismatched callback

The OnlyOffice service regression MUST exercise `handleCallback` with a token whose signature, algorithm, secret, and claims are valid, including a signed document identity of `7`, while invoking route document `42`. The service MUST retain the existing safe failure result `{ error: 1 }`; the case MUST demonstrate route-claim mismatch rather than authentication failure.

#### Scenario: Valid credentials cannot authorize another route

- GIVEN a validly signed HS256 token identifies document `7`
- AND the callback is invoked for route document `42`
- WHEN `handleCallback` evaluates the verified identity
- THEN it MUST return `{ error: 1 }`
- AND the rejection MUST be attributable to the route mismatch

### Requirement: Prove route-mismatch rejection performs no downstream work

The focused service fixture MUST reset applicable mocks after construction and immediately before invocation. The regression MUST assert zero calls after rejection for fetch, filesystem writes, Prisma document lookup and transaction, storage/path/hash collaborators, and every transaction delegate exposed by the fixture. Assertions MUST use resettable observable doubles and remain scoped to this route-mismatch service case.

#### Scenario: Rejected route mismatch leaves collaborators untouched

- GIVEN all downstream observables have been reset immediately before `handleCallback`
- WHEN a validly signed token for document `7` is submitted to route document `42`
- THEN the service MUST return `{ error: 1 }`
- AND each applicable downstream collaborator MUST have zero calls

### Requirement: Preserve explicit unavailable historical RED evidence

The phase-owned evidence receipt MUST identify historical RED evidence as `unavailable` when the prior failing output was not captured. It MUST record only evidence captured during this successor phase and MUST NOT reconstruct, infer, or claim an earlier failing result from current green evidence.

#### Scenario: Evidence distinguishes unavailable history from current observations

- GIVEN historical RED output was not captured
- WHEN successor evidence is recorded
- THEN the RED status MUST be `unavailable`
- AND current apply or verification observations MUST be labeled as successor evidence only

### Requirement: Enforce the under-60-line review gate

The successor delta MUST remain strictly below 60 changed lines, counting additions and deletions across the focused service test and phase-owned evidence receipt. If the forecast or measured delta reaches 60, work MUST stop for an explicit `ask-on-risk` decision; no size exception, chain strategy, production edit, or unrelated artifact change MAY be inferred.

#### Scenario: Bounded successor remains deliverable

- GIVEN the measured successor delta is fewer than 60 changed lines
- WHEN the review gate is evaluated
- THEN work MAY proceed only within the focused test and evidence scope

#### Scenario: Oversized successor pauses delivery

- GIVEN the measured or forecast successor delta reaches 60 changed lines
- WHEN the review gate is evaluated
- THEN work MUST stop and request the configured `ask-on-risk` decision
- AND no alternate delivery strategy or exception MAY be assumed
