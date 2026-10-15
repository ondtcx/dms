# Proposal: OnlyOffice Route-Mismatch TDD Receipt

## Intent
Add one focused service regression proving that a validly signed callback cannot authorize a different route document. The test must distinguish route authorization failure from authentication failure and preserve downstream safety evidence.

## Scope
- Edit only `src/onlyoffice/onlyoffice.service.spec.ts` and, if required, its phase-owned OpenSpec receipt.
- Use an HS256 token signed with `secret.trim()` whose claim identifies document `7`, while invoking route document `42`.
- Follow strict TDD: capture a fresh failing assertion for the intended observable boundary before any GREEN result, then add the final route-mismatch assertion and pass it.
- Reset mocks immediately after fixture construction and immediately before invocation.
- Assert the response is exactly `{ error: 1 }`, representing route authorization failure rather than invalid-signature authentication failure.
- Assert zero calls to fetch, filesystem writes, Prisma document lookup/transaction, storage/path/move/delete/hash collaborators, and every exposed transaction delegate.
- Record only phase-owned RED and GREEN receipts; do not reconstruct unavailable historical output.

## Affected areas
The OnlyOffice service regression spec and its OpenSpec evidence only. No production, controller, configuration, schema, generated, or unrelated files change.

## Risks and mitigations
Mock state or fixture setup could make zero-call evidence misleading; the two required resets and explicit collaborator assertions bound that risk. The change must remain below 60 additions plus deletions; pause for ask-on-risk at 60 or more without inferring a chain or exception.

## Rollback
Remove the focused regression and its phase-owned receipt, leaving production code and existing unrelated tests untouched.

## Success criteria
- Fresh RED and subsequent GREEN receipts are captured in order.
- The valid-signature route mismatch returns `{ error: 1 }`.
- All listed downstream collaborators remain at zero calls.
- No commands are run, no commit is made, and the diff stays strictly under 60 lines.
