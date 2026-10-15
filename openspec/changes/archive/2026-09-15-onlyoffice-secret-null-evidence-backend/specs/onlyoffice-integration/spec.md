# OnlyOffice Integration Specification

## Purpose

Define the focused GREEN-only evidence required for fail-closed handling when the OnlyOffice secret lookup returns `null`.

## Requirements

### Requirement: Direct null-secret verification returns null

The OnlyOffice service MUST provide a direct regression scenario in which a `null` `ONLYOFFICE_SECRET` lookup causes `verifyFileToken('token', 42)` to return the concrete `null` result.

#### Scenario: Null secret produces a null verification result

- GIVEN the OnlyOffice service is configured with a `null` secret lookup result
- WHEN `verifyFileToken('token', 42)` is called
- THEN the call MUST return `null`
- AND this scenario MUST be recorded as GREEN evidence

### Requirement: Null-secret verification performs no downstream work

The null-secret verification scenario MUST demonstrate zero calls to downstream collaborators, including fetch, filesystem, storage, Prisma, and transaction collaborators.

#### Scenario: Null secret short-circuits all downstream collaborators

- GIVEN the OnlyOffice service is configured with a `null` secret lookup result
- WHEN `verifyFileToken('token', 42)` is called
- THEN every established downstream collaborator MUST have zero calls

### Requirement: RED evidence is not fabricated

The evidence for this change MUST NOT claim, reconstruct, or fabricate a RED result; unavailable historical RED evidence MUST remain explicitly unavailable.

#### Scenario: Evidence remains GREEN-only

- GIVEN the direct null-secret regression passes
- WHEN the evidence is reported
- THEN it MUST report GREEN evidence only
- AND it MUST NOT present a newly created or reconstructed RED result

### Requirement: Evidence change remains under the line budget

The test/evidence-only implementation change MUST remain below 40 changed lines and MUST NOT include production or unrelated test changes.

#### Scenario: Narrow evidence change satisfies the gate

- GIVEN the null-secret evidence is added
- WHEN the change is reviewed
- THEN the implementation-and-regression delta MUST be fewer than 40 changed lines
- AND only the focused OnlyOffice service regression MAY be changed
