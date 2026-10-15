# OnlyOffice Secret Lookup Fail-Closed Specification

## Purpose

Define a bounded backend security fix: direct OnlyOffice file-token verification MUST fail closed when the secret lookup throws or yields no secret.

## Requirements

### Requirement: Normalize unusable secret lookups to an invalid file token

`OnlyofficeService.verifyFileToken(token, documentId)` MUST return `null` when `ConfigService.get('ONLYOFFICE_SECRET')` throws or returns `null`. It MUST NOT expose or rethrow a lookup error, and valid or otherwise invalid authentication behavior MUST remain unchanged.

#### Scenario: Fresh RED captures a throwing secret lookup

- GIVEN `ConfigService.get('ONLYOFFICE_SECRET')` throws a sentinel error
- WHEN the focused direct-service regression runs before the production change
- THEN fresh RED evidence MUST show that the sentinel error escapes instead of resolving to `null`

#### Scenario: GREEN normalizes a throwing secret lookup

- GIVEN `ConfigService.get('ONLYOFFICE_SECRET')` throws the sentinel error after the minimal production change
- WHEN `verifyFileToken` is called
- THEN it MUST resolve to `null` without exposing or rethrowing the sentinel error

#### Scenario: GREEN normalizes a null secret result

- GIVEN `ConfigService.get('ONLYOFFICE_SECRET')` returns `null`
- WHEN `verifyFileToken` is called
- THEN it MUST resolve to `null`

### Requirement: Stop direct verification before downstream work

For a throwing or `null` secret lookup, `verifyFileToken` MUST make zero calls to every downstream collaborator covered by the existing service fixture and `expectNoDownstreamWork` assertion.

#### Scenario: Service-level zero downstream calls

- GIVEN the secret lookup throws or returns `null`
- WHEN the direct service verifier is called
- THEN it MUST return `null`
- AND the service-level no-downstream assertion MUST pass

### Requirement: Preserve a bounded strict-TDD delivery

The work unit MUST add fresh direct-service RED coverage before changing production code, then record GREEN evidence for throwing and `null` secret lookups and zero downstream calls. Only the service production and service spec files MAY change for this work unit. Existing controller tests are safety-net coverage only and MUST NOT be expanded. The complete production-and-regression change MUST remain under 60 changed lines; reaching 60 lines MUST pause delivery for the configured review-risk decision.

#### Scenario: Scope and size gate are enforceable

- GIVEN the completed direct-service strict-TDD work unit
- WHEN its changed files and line count are reviewed
- THEN only the two service paths MUST be changed
- AND the total changed lines MUST be fewer than 60
- AND no controller production, controller test, route, Prisma, configuration, generated-output, or unrelated authentication changes MAY be included
