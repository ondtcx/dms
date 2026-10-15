# Exploration: onlyoffice-secret-lookup-fail-closed-backend

## Scope

This slice covers one strict-TDD behavior only: when `ConfigService.get('ONLYOFFICE_SECRET')` throws, `OnlyofficeService.verifyFileToken` must fail closed by returning `null`, and the file route must perform no Prisma or file-stream work.

No other callback/file authentication matrices, secret values, routes, persistence behavior, or unrelated files are in scope.

## Existing evidence

- `src/onlyoffice/onlyoffice.service.ts` implements `verifyFileToken(token, documentId)` through the private `verifyToken` helper.
- `verifyToken` calls `this.config.get<unknown>('ONLYOFFICE_SECRET')` before its `try` block. An exceptional getter therefore escapes instead of becoming `null`.
- `src/onlyoffice/onlyoffice.controller.ts` calls `verifyFileToken` before `prisma.document.findUnique` and before `createReadStream`; a safe `null` result already maps to the generic unauthorized failure.
- Existing OnlyOffice service and controller specs provide the relevant configuration, Prisma, and filesystem mocks. They should be extended only with this regression.

## Strict-TDD evidence plan

### RED

Add a focused regression that makes the configuration getter throw. First capture the current failure: `verifyFileToken` rejects/throws instead of returning `null`. Through the file route, assert the generic unauthorized failure and zero calls to Prisma document lookup and `createReadStream`.

### GREEN

Move the configuration lookup into the same guarded failure boundary as JWT verification, or otherwise normalize getter exceptions to `null`. Re-run the focused regression and confirm the direct verifier returns `null`, the controller rejects safely, and no downstream file or Prisma collaborator is called.

## Allowed edit surface

- `src/onlyoffice/onlyoffice.service.ts`
- `src/onlyoffice/onlyoffice.service.spec.ts`
- `src/onlyoffice/onlyoffice.controller.spec.ts`

Do not modify controller production behavior, other authentication cases, configuration, Prisma, generated output, or unrelated pending files. No implementation is performed during exploration.
