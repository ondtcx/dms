# Exploration: onlyoffice-auth-rejection-evidence-backend

## Controller invalid-token invocation mismatch

The controller rejection matrix is not currently evidentially valid because each case invokes `getFile` with the literal token `token`, while the mocked `verifyFileToken` expectation is configured for `invalid-${label}`. The assertion therefore fails at the invocation contract before the intended invalid-token rejection and downstream call behavior can be observed. This mismatch must be corrected in the evidence path without broadening the controller scope.

## Service rejected-path downstream zero-call assertions

The service rejection matrix currently checks the rejected result but does not reset and assert the applicable downstream collaborators remain untouched. Rejected authentication and claim cases need concrete zero-call assertions for the observable fetch, Prisma, transaction, filesystem/path, stream, storage, audit, and document-update collaborators exposed by the existing mocks. These assertions must demonstrate that rejection stops downstream work rather than merely returning `{ error: 1 }`.

## Invalid file-token no-Prisma evidence

Invalid file-token cases must prove the shared verification boundary rejects malformed, expired, unsigned, wrong-algorithm, wrong-route, and missing-secret inputs before any Prisma access. The evidence should reset the relevant mocks and assert that document/version lookups, transactions, and other downstream persistence calls are not invoked. This is distinct from missing-document or missing-version handling, where an allowed document lookup may occur but path or stream dereference must not.

## Historical RED evidence

Historical RED evidence remains unavailable. It must be reported as unavailable and must not be reconstructed, inferred, or fabricated from current results.
