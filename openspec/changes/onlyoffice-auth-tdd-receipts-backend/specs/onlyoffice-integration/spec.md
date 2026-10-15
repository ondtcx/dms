# OnlyOffice Integration Specification

## Purpose

Define a focused backend regression that proves a validly signed OnlyOffice callback cannot authorize a document different from the route document, while preserving strict-TDD evidence and downstream safety.

## Acceptance Criteria

- The change remains a single focused service-test work unit and changes no production, controller, configuration, schema, generated, or unrelated files.
- The net additions plus deletions remain strictly below 60 lines; reaching 60 or more is an ask-on-risk gate, with no inferred chain or exception.
- Only phase-owned RED and GREEN receipts are recorded; unavailable historical output is not reconstructed.

## Requirements

### Requirement: Prove route mismatch with a valid signature

The regression MUST exercise an HS256 callback token signed with `secret.trim()` whose document claim identifies document `7`, while invoking route document `42`.

#### Scenario: A valid signature cannot authorize another route document

- GIVEN the callback token has a valid HS256 signature and identifies document `7`
- WHEN the service is invoked for route document `42`
- THEN the response MUST be exactly `{ error: 1 }`
- AND the result MUST represent route authorization failure rather than invalid-signature authentication failure

### Requirement: Capture strict-TDD receipts in order

The work MUST capture a fresh RED receipt for the intended observable boundary before any GREEN result, then capture GREEN only after adding the final route-mismatch assertion and obtaining the passing result.

#### Scenario: Fresh RED precedes GREEN

- GIVEN the validly signed route-mismatch fixture is constructed
- WHEN the first intended-boundary assertion is evaluated
- THEN a failing RED receipt MUST be recorded before the final route-mismatch assertion is added
- AND a GREEN receipt MUST NOT be recorded or inferred at that point

#### Scenario: GREEN follows the final assertion

- GIVEN the fresh RED receipt exists
- WHEN the final route-mismatch assertion is added and the focused case passes
- THEN a GREEN receipt MUST be recorded after RED
- AND only current phase-owned evidence MAY be recorded

### Requirement: Reset mocks before observable invocation

The regression MUST reset mocks immediately after fixture construction and immediately before service invocation so downstream zero-call assertions are attributable to the route-mismatch execution.

#### Scenario: Resettable fixture and invocation boundaries

- GIVEN all callback fixtures and exposed collaborators have been constructed
- WHEN fixture construction completes and again immediately before invocation
- THEN mocks MUST be reset at both boundaries
- AND assertions MUST cover only calls made by the focused invocation

### Requirement: Preserve downstream zero-call safety

For the valid-signature route mismatch, the regression MUST assert zero calls to fetch, filesystem writes, Prisma document lookup and transaction, storage/path/move/delete/hash collaborators, and every exposed transaction delegate.

#### Scenario: Authorization stops downstream work

- GIVEN the callback signature is valid but its document claim does not match route document `42`
- WHEN the service handles the callback
- THEN fetch, filesystem-write, Prisma document lookup, and Prisma transaction collaborators MUST each have zero calls
- AND storage, path, move, delete, and hash collaborators MUST each have zero calls
- AND every exposed transaction delegate MUST have zero calls
