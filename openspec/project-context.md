# Project Context: dms-backend

## Authority

OpenSpec is authoritative for this independent backend repository. Active change
artifacts belong under `openspec/changes/`; existing archived changes and shared
specifications must be preserved.

## Stack and architecture

- NestJS 10 REST API with TypeScript
- Prisma 6 client and PostgreSQL persistence
- Feature-oriented `src/` modules with controllers, services, DTOs, guards, and tests
- Jest for unit and integration-style tests; Supertest is available for HTTP tests
- Jest e2e configuration at `test/jest-e2e.json`
- npm package management; build through Nest CLI
- Uploaded files are stored under `uploads/` and exposed through the backend file route

## Verification

- Focused tests: `npm run test -- <path-to-spec>`
- Unit test suite: `npm test`
- E2E tests: `npm run test:e2e`
- Build: `npm run build`
- Lint: `npm run lint`
- Format: `npm run format`
- Strict TDD: enabled

## Repository conventions

- Technical artifacts, code, filenames, and commit messages are English.
- Comments and user-facing UI/API text are Spanish where applicable.
- Use NestJS exceptions, Prisma service access, class-validator DTOs, and Spanish Swagger descriptions.
- Preserve the existing API prefix `/api` and JWT/CORS configuration.

## Initialization baseline

The requested change `review-backend-implementations` is not yet recreated by this
initialization. No implementation or verification phase has run. At initialization,
the checkout has pending changes in `.gitignore` and
`src/settings/settings.service.ts`, plus an untracked `.pi/` directory; these are
pre-existing working-tree state and are outside this initialization scope.

## Session delivery settings

- Execution mode: automatic
- Artifact store: OpenSpec
- Delivery strategy: ask on review-budget or other delivery risk
- Review budget: 400 changed lines
- Chain strategy: deferred until chaining is selected
