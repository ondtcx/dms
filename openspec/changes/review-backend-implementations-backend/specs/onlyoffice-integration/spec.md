# OnlyOffice Backend Integration Specification

## Purpose

Harden the backend OnlyOffice callback and file boundaries so authenticated saves preserve valid document content and immutable version history without redesigning the wider document subsystem or OnlyOffice deployment.

## Requirements

### Requirement: Authenticate and identify OnlyOffice callbacks

The system MUST require a valid OnlyOffice callback JWT signed with the configured `ONLYOFFICE_SECRET` and an explicitly permitted signing algorithm before trusting callback fields or mutating document state. The system MUST fail closed when the secret is missing or blank, or when the token is malformed, expired, invalid, or uses a disallowed algorithm. The system MUST cross-check the authenticated document identity with the route document ID and callback document key when that claim is present.

#### Scenario: Authenticated status-2 callback is accepted

- GIVEN a callback request contains a valid, unexpired JWT signed with `ONLYOFFICE_SECRET`
- AND the authenticated document identity, route document ID, and callback document key agree
- WHEN the callback reports status `2`
- THEN the system MAY proceed to validate the payload and upstream response
- AND no authentication failure is returned

#### Scenario: Invalid callback authentication is rejected before mutation

- GIVEN a callback request has a missing, blank, malformed, expired, mismatched, or disallowed-algorithm JWT
- WHEN the callback is received
- THEN the system MUST reject it before reading or mutating document state
- AND MUST NOT create a version or audit event
- AND MUST NOT expose the token, secret, or configuration details in the response or logs

### Requirement: Validate callback payloads and OnlyOffice upstream content

The system MUST validate callback bodies before processing them. A status-2 callback MUST contain a valid document identity and a supported HTTP(S) download URL, and the URL MUST remain within the configured or trusted OnlyOffice upstream boundary. The system MUST use bounded upstream request behavior and MUST reject redirects outside that boundary, network failures, non-success responses, unusable content, and responses exceeding the configured size limit. Valid empty text documents MAY be accepted where the existing document type permits them; empty or unusable binary/office content MUST be rejected. Non-status-2 callbacks MUST remain no-op acknowledgements and MUST NOT create versions.

#### Scenario: Malformed status-2 payload is rejected without side effects

- GIVEN an authenticated callback reports status `2`
- AND its document identity or download URL is missing, invalid, or unsupported
- WHEN the callback is processed
- THEN the system MUST return the documented failure signal
- AND MUST NOT fetch upstream content or mutate the document, versions, files, or audit records

#### Scenario: Unsafe or failed upstream response is not persisted

- GIVEN an authenticated, structurally valid status-2 callback references an untrusted URL, times out, fails to connect, redirects outside the trusted boundary, returns a non-success status, exceeds the response limit, or contains unusable content
- WHEN the system downloads the callback content
- THEN the system MUST return the documented failure signal without exposing upstream internals
- AND MUST leave the document, version history, current file, checksums, and audit records unchanged

#### Scenario: Non-status-2 callback is acknowledged without a write

- GIVEN a callback passes the required authentication boundary and reports a supported status other than `2`
- WHEN the callback is received
- THEN the system MUST acknowledge it according to the OnlyOffice callback contract
- AND MUST NOT download content or create a version or audit event

### Requirement: Store immutable files for persisted versions

The system MUST store every callback-created version at a distinct physical path and MUST never overwrite a path referenced by an existing retained version. Each new version MUST retain its own stored name, path, checksum, and metadata, while prior versions' bytes and metadata remain unchanged. The system MUST synchronize the document current-version number and document-level checksum with the newly persisted latest version. Existing shared-path historical rows MUST remain readable, and this change MUST NOT perform broad historical-data migration or cleanup.

#### Scenario: Valid save preserves historical bytes and metadata

- GIVEN an authenticated and validated status-2 callback downloads valid content
- WHEN the new version is persisted
- THEN the new version MUST have a unique physical storage path
- AND every prior version MUST still resolve to its previously stored bytes, path, checksum, and metadata
- AND the document current-version number and checksum MUST match the new latest version

#### Scenario: Failed persistence does not delete retained history

- GIVEN content has been staged but validation, transaction, or database persistence fails
- WHEN failure cleanup runs
- THEN the system MUST make a best-effort cleanup of unreferenced staged files
- AND MUST NOT delete or overwrite any path referenced by a retained version
- AND MUST NOT leave a document current-version update without its matching version record

### Requirement: Persist callback results idempotently and transactionally

The system MUST derive a stable idempotency key from the authenticated callback identity and canonical callback data and MUST enforce its uniqueness at the persistent database boundary. Document coordination, version-number allocation, version creation, document checksum/current-version update, and the valid supplied-user audit event MUST execute within one database transaction using row locking or an equivalent concurrency guard. An authenticated duplicate callback MUST be an idempotent no-op after the original write commits. Distinct concurrent callbacks MUST receive distinct sequential versions.

#### Scenario: Retried callback creates one version and one audit event

- GIVEN the same authenticated callback is delivered more than once
- WHEN the first delivery commits successfully and a later delivery is processed
- THEN the later delivery MUST be acknowledged as already applied
- AND MUST NOT create another version, advance the current-version number, or create another audit event

#### Scenario: Concurrent distinct callbacks remain consistent

- GIVEN two authenticated valid callbacks for distinct save events arrive concurrently for the same document
- WHEN both persistence operations complete
- THEN each committed callback MUST have a distinct sequential version
- AND each version MUST have its own immutable path
- AND the final document current-version number and checksum MUST correspond to the latest committed version
- AND a failed transaction MUST leave no partial version, audit event, or current-version advance

### Requirement: Validate document and audit identities with safe errors

The system MUST handle invalid document IDs, missing documents, missing current versions, malformed callback bodies, missing configuration, and invalid or unknown supplied user identifiers without unsafe exceptions, false success, or information leakage. The system MUST validate a supplied user before recording an audit event and MUST NOT attribute an update to the document owner or another fallback user. Error responses MUST use the documented callback success/failure shape and MUST omit secrets, tokens, upstream internals, and database details.

#### Scenario: Missing document or current version fails safely

- GIVEN an authenticated callback references an invalid or missing document, or a document has no current version when one is required
- WHEN the callback is processed
- THEN the system MUST return the documented failure signal
- AND MUST NOT perform a version write, file replacement, or audit attribution
- AND MUST NOT throw an unhandled array-access or persistence error

#### Scenario: Invalid audit user is never substituted

- GIVEN a callback supplies a malformed or unknown user identifier
- WHEN a status-2 save is processed
- THEN the system MUST fail safely according to the callback contract
- AND MUST NOT create an audit event attributed to a fallback user
- AND MUST NOT commit the document or version mutation unless the defined persistence contract explicitly permits a no-attribution result

### Requirement: Preserve cross-platform path behavior

The system MUST construct and compare OnlyOffice storage paths using platform-safe path helpers rather than hard-coded separator assumptions. Regression assertions MUST be valid on Windows and POSIX platforms and MUST verify path relationships without weakening the immutable-path contract.

#### Scenario: Storage path assertions work across platforms

- GIVEN the OnlyOffice service creates or returns a storage path
- WHEN the behavior is exercised on Windows or POSIX
- THEN path construction and path comparisons MUST use the active platform's safe semantics
- AND the resulting path MUST identify the intended stored file without requiring a Windows-specific or POSIX-specific slash literal

### Requirement: Maintain focused regression coverage within scope

The implementation MUST include focused regression coverage for callback JWT validity and identity matching, missing-secret and missing-version handling, malformed payloads, upstream failures and unusable content, immutable paths and historical preservation, synchronized checksums/current versions, duplicate and concurrent callbacks, transaction failure and cleanup, valid and invalid audit users, and existing health, file-token, status-2, and controller audit behavior. The coverage MUST retain platform-independent assertions and MUST remain bounded to the OnlyOffice hardening slice within the 400 changed-line review budget; if the forecast exceeds that budget, implementation MUST pause for the configured ask-on-risk delivery decision.

#### Scenario: Hardening regressions cover security and integrity boundaries

- GIVEN the focused OnlyOffice service and controller regression suite is run
- WHEN it exercises valid and invalid authentication, payload, upstream, persistence, concurrency, cleanup, identity, and path cases
- THEN each required behavior MUST have a passing regression that observes the externally relevant result and side effects
- AND existing health, file-token, status-2, and reported-user audit behavior MUST remain covered

#### Scenario: Review budget remains protected

- GIVEN implementation or regression coverage is forecast to exceed 400 changed lines
- WHEN the review-budget risk is identified
- THEN work MUST pause under the `ask-on-risk` strategy
- AND no chain strategy or `size:exception` approval MAY be inferred
