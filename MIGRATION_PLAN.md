# Clean Architecture Migration Plan

## 1. Goal
Migrate the `dms-backend` (NestJS) from a traditional Controller -> Service -> Prisma architecture to a Clean Architecture (Hexagonal) pattern, focusing ONLY on the core features currently active in the `dms-frontend`.

## 2. Approach: Spec-Driven Development (SDD)
1. **Define Specs first**: Before touching any code, we will write SDD specs for each module.
2. **Parallel Implementation**: We will implement the new `domain` (entities, repository interfaces) and `application` (use cases) layers alongside the existing legacy code.
3. **No Breakage**: The existing controllers and services will NOT be touched or wired to the new architecture until the new layers are fully tested and functional.
4. **Iterative Adoption**: Once a module's Use Cases are ready, we will swap the Controller's dependency from the legacy Service to the new Use Cases.

## 3. Scope: The "Cut Product" (Active Features Only)
The migration will focus ONLY on these modules, as they are the only ones exposed in the frontend:

### Phase 1: Catalogs & Parameters (Low Complexity, Good for testing the pattern)
- [ ] `category`
- [ ] `document-type`
- [ ] `department`
- [ ] `section`
- [ ] `academic-year`

### Phase 2: Access & Identity (Medium Complexity)
- [ ] `auth`
- [ ] `user`
- [ ] `role`
- [ ] `permission`

### Phase 3: Core Domain (High Complexity)
- [ ] `document`
- [ ] `batch`
- [ ] `document-composition`
- [ ] `onlyoffice` (integration)
- [ ] `storage` (integration)

### Phase 4: Search
- [ ] `search`

*Note: Ghost modules like `workflows`, `transfers`, `shares`, `tasks`, `comment`, `report` will be IGNORED during this migration.*

## 4. Architecture Pattern (Screaming Architecture)
Inside each module (e.g., `src/category/`), we will create:

```text
src/category/
├── domain/                    <-- Level 1: Pure Domain
│   ├── category.entity.ts     # Pure TypeScript class, NO Prisma
│   ├── category.repository.ts # Interface (Port)
│   └── category.exceptions.ts # Domain errors
├── application/               <-- Level 2: Use Cases
│   └── use-cases/
│       ├── create-category.use-case.ts
│       └── get-active-categories.use-case.ts
└── infrastructure/            <-- Level 3: Framework & DB
    ├── controllers/
    │   ├── category.controller.ts
    │   └── dto/
    ├── database/
    │   └── prisma-category.repository.ts # Prisma implementation
    └── category.module.ts
```

## 5. Current Progress
- **Initialization**: SDD Context and Testing Capabilities mapped and saved to Engram.
- **Plan**: Migration plan documented.
- **Next Step**: Start writing Specs for Phase 1 (Catalogs).
