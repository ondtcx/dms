# OnlyOffice Authentication Regression Evidence Specification

## Purpose

Define the final backend test and evidence requirements for the OnlyOffice authentication regression successor. This specification is limited to regression tests, their observable evidence, and review-size control; it MUST NOT require production changes or broaden the existing authentication contract.

## Requirements

### Requirement: Distinguish mismatched dual tokens with valid credentials

The regression suite MUST include a mismatch case using two unequal, independently signed HS256 tokens that use the configured secret and claims valid for the route. It MUST send one token through the authorization header and the other through the body token, assert the existing `{ error: 1 }` failure, and retain a matching-dual-token acceptance control. Evidence MUST demonstrate that token disagreement—not invalid claims—is the rejection cause.

#### Scenario: Independently valid dual tokens are rejected

- GIVEN the header and body contain unequal tokens whose signatures, algorithm, secret, expiry, and route claims are independently valid
- WHEN the callback authentication boundary processes both transports
- THEN the callback MUST return the existing failure shape `{ error: 1 }`
- AND the recorded verifier or downstream observations MUST identify the disagreement as the rejection condition

#### Scenario: Equal dual tokens remain accepted

- GIVEN the header and body contain the same valid token
- WHEN the callback authentication boundary processes both transports
- THEN the existing matching-dual behavior MUST remain passing

### Requirement: Prove rejected paths have no applicable mutation or downstream access

The regression suite MUST reset relevant mocks for each applicable rejected case and assert that rejection does not invoke observable downstream work. Coverage MUST include invalid verified claims, route or body disagreement, unsupported status, missing status-2 identity, invalid file tokens, and missing document/version states. Assertions MUST cover applicable fetch, Prisma document/version/access calls, transactions, filesystem or path access, streams, storage moves, audits, and document updates; invalid file tokens MUST be shown to stop before Prisma.

#### Scenario: Invalid service authentication remains side-effect free

- GIVEN a verified-claim, route-binding, body-binding, status, or status-2 identity case is invalid
- WHEN the service rejects the request
- THEN the safe failure result MUST be returned
- AND every applicable downstream retrieval, transaction, filesystem, stream, audit, and document-update observation MUST remain untouched

#### Scenario: Invalid file tokens stop before persistence access

- GIVEN a file token is malformed, expired, unsigned, signed with a wrong algorithm, bound to the wrong route, or unverifiable because the secret is missing
- WHEN file access is attempted
- THEN the request MUST fail safely
- AND no Prisma document, version, or access call MUST occur

### Requirement: Reject missing documents and versions before stream dereference

The controller regression suite MUST cover absent documents and both absent and empty `versions` collections. It MAY permit the document lookup needed to establish state, but MUST assert rejection before path dereference or `createReadStream`. The existing valid-stream case MUST remain as a passing safety comparison.

#### Scenario: Missing document or version cannot create a stream

- GIVEN the requested document is absent, or its `versions` value is absent or empty
- WHEN the file controller handles the request
- THEN the existing failure behavior MUST be returned
- AND path access and `createReadStream` MUST not be observed

#### Scenario: Valid latest version retains stream behavior

- GIVEN a known document has a valid latest version and file path
- WHEN the file controller handles the request
- THEN the existing valid stream behavior MUST remain passing

### Requirement: Record task-level strict-TDD evidence

The successor evidence receipt MUST contain one independently attributable row for each remaining regression task. Every row MUST identify the covered case, the first RED failure, the exact focused GREEN command and captured result, TRIANGULATE observations, and an independently attributable SAFETY-NET result. Evidence MUST preserve unavailable or failing history as a blocker and MUST NOT replace case-level receipts with aggregate suite prose or fabricated command output.

#### Scenario: Each remaining task has a complete receipt

- GIVEN the dual-token, no-mutation, and missing-version regression tasks are evaluated
- WHEN the successor evidence receipt is reviewed
- THEN each task MUST have distinct RED, GREEN, TRIANGULATE, and SAFETY-NET evidence with named cases and captured results

### Requirement: Enforce a hard under-100-line successor gate

The successor test-and-evidence delta MUST remain strictly below 100 changed lines, counting additions and deletions. At 100 changed lines or when the bound is threatened, work MUST stop and request the configured `ask-on-risk` decision. No `size:exception`, chain strategy, production edit, or unrelated artifact change MAY be inferred or introduced.

#### Scenario: Bounded successor remains deliverable

- GIVEN the measured successor delta is fewer than 100 changed lines
- WHEN the review gate is checked
- THEN the change MAY proceed only within the specified test and evidence scope

#### Scenario: Hard line gate stops oversized work

- GIVEN the measured successor delta reaches 100 changed lines or is forecast to reach that threshold
- WHEN the gate is evaluated
- THEN work MUST stop for an explicit `ask-on-risk` decision
- AND no exception or alternate delivery strategy MAY be assumed
