# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **NestJS Document Management System (DMS)** backend API for managing documents, templates, categories, sections, and users. The system supports:

- **Document management**: Upload, organize, version, soft-delete, and restore documents
- **Template-based document generation**: Generate PDFs/HTML from templates using Handlebars + Puppeteer
- **Categorization & Sections**: Organize documents by categories and sections
- **Authentication & Authorization**: JWT-based auth with user/admin roles
- **Thumbnail generation**: Automatic thumbnail creation for documents and templates
- **Audit trail**: Track document access (view, download, update, delete)

## Commands

### Development
```bash
npm run start:dev          # Start server in watch mode (default port 3000)
npm run start:debug        # Start with debugging enabled
npm run build              # Build the project
npm run format             # Format code with Prettier
npm run lint               # Run ESLint and auto-fix
```

### Testing
```bash
npm run test               # Run all unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Generate test coverage report
npm run test:e2e           # Run e2e tests
npm run test -- <path>     # Run specific test file
```

### Database (Prisma)
```bash
npm run seed                     # Seed database with initial data (creates admin user)
npx prisma migrate dev           # Create and apply a new migration
npx prisma migrate reset         # Reset DB, run all migrations, and reseed
npx prisma studio                # Open Prisma Studio GUI
npx prisma generate              # Regenerate Prisma Client after schema changes
npx prisma migrate dev --name <migration_name>  # Create migration with specific name
```

## Architecture Overview

### Core Module Structure

The application follows NestJS modular architecture with the following key modules:

```
src/
├── auth/              # Authentication (JWT, guards, decorators)
├── user/              # User management
├── document/          # Document upload, CRUD, versioning, soft-delete
├── document-template/ # Template CRUD + document generation (PDF/HTML)
├── category/          # Document categories
├── section/           # Document sections
├── storage/           # File system operations (structured storage)
├── tasks/             # Scheduled tasks (cron jobs for cleanup)
└── prisma/            # Database service (Prisma ORM)
```

### Database Schema (Prisma + PostgreSQL)

Key models and relationships:

- **User**: Stores users with roles (`user` | `admin`)
- **Document**: Main document entity with soft-delete (`deletedAt`), versioning, thumbnails
  - Related to: `User` (uploader), `Category`, `Section`, `DocumentTemplate` (if generated)
  - Stores: `formData` (JSON if generated from template), `checksumSHA256` (file integrity)
- **DocumentTemplate**: Reusable templates with Handlebars HTML + CSS
  - Fields: `fields` (JSON schema), `htmlTemplate`, `styles`, `outputFormat` (pdf/html)
- **DocumentVersion**: Version history for documents
- **DocumentAccess**: Audit trail (VIEW, DOWNLOAD, UPDATE, DELETE actions)
- **Category**: Document categories (with color/icon for UI)
- **Section**: Document sections (organizational unit)

### Storage Architecture

Managed by `StorageService` (src/storage/storage.service.ts):

**Directory structure:**
```
uploads/
├── active/         # Active documents (organized by date/user/category)
│   └── YYYY/MM/DD/users/<userId>/categories/<catId>/
├── archive/        # Archived documents (same structure as active)
├── trash/          # Soft-deleted documents (flat with timestamp prefix)
├── temp/           # Temporary files
└── thumbnails/     # Generated thumbnails (PNG, 200x283px)
```

**Key patterns:**
- Documents use structured paths: `active/2025/01/15/users/user_abc/categories/cat_1/file.pdf`
- Versions stored in: `active/YYYY/MM/DD/users/<userId>/versions/`
- Soft-delete moves files to `trash/` with naming: `YYYY-MM-DD_doc<id>_<filename>`
- File integrity verified via SHA256 checksums

### Authentication & Authorization

**JWT-based authentication** with two roles: `user` and `admin`

**Key components:**
- `AuthGuard` (src/auth/guards/auth.guard.ts): Global JWT validation guard
- `RolesGuard` (src/auth/guards/roles.guard.ts): Role-based authorization
- `@Public()` decorator: Bypass authentication for specific endpoints
- `@CurrentUser()` decorator: Extract current user from request
- `@Roles(UserRole.ADMIN)` decorator: Restrict access to specific roles

**Pattern:**
```typescript
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
async adminOnlyEndpoint(@CurrentUser() user) { ... }
```

**User payload in request:**
```typescript
request.user = {
  id: string,      // User ID (from JWT 'sub')
  email: string,
  role: UserRole   // 'user' | 'admin'
}
```

### Document Template System

**Template generation flow:**
1. Define template with `fields` (JSON schema) and `htmlTemplate` (Handlebars)
2. User fills form with data matching field schema
3. `DocumentGeneratorService` merges form data with Handlebars template
4. Puppeteer renders HTML → PDF (or save as HTML)
5. Document saved with `formData`, linked to `templateId`

**Key services:**
- `DocumentTemplateService.createDocumentFromTemplate()`: Main generation entry point
- `DocumentGeneratorService.generatePDF()`: Puppeteer-based PDF generation
- `DocumentGeneratorService.generateHTML()`: Handlebars rendering

**Template metadata injection:**
Templates automatically receive `_metadata` object:
```javascript
{
  _metadata: {
    generatedAt: ISO timestamp,
    generatedDate: localized date,
    generatedTime: localized time,
    templateName: template name,
    templateType: template type
  }
}
```

### Thumbnail Generation

Managed by `ThumbnailService` (src/document/thumbnail.service.ts):

- **Automatic generation**: On document upload or template preview
- **PDF → PNG**: Uses `pdf-to-img` library to convert first page
- **Image optimization**: Sharp library resizes to 200x283px, 80% quality
- **Storage**: `uploads/thumbnails/<id>.png`
- **Template thumbnails**: Use negative IDs (e.g., template ID 5 → thumbnail -5.png)

## Development Guidelines

### NestJS Patterns

**Controllers:**
- Use `@ApiTags()` for Swagger grouping
- Use `@ApiOperation({ summary: 'Spanish description' })` for endpoint docs
- Use `@ApiBearerAuth('JWT-auth')` for authenticated endpoints
- Document responses with `@ApiResponse()`
- API prefix is `/api` (set in main.ts)

**Services:**
- Inject dependencies via constructor
- Return Prisma types or DTOs
- Handle errors with NestJS exceptions: `NotFoundException`, `UnauthorizedException`, `ConflictException`, `BadRequestException`, `ForbiddenException`
- Always exclude `password` when returning user data: `Omit<User, 'password'>`

**DTOs:**
- Use `class-validator` decorators for validation
- Use `@ApiProperty({ example: '...' })` for Swagger docs
- Partial DTOs for updates (use `@nestjs/mapped-types` `PartialType`)

**Guards & Decorators:**
- `AuthGuard` is applied globally (except `@Public()` routes)
- Use `@Roles(UserRole.ADMIN)` for admin-only endpoints
- Access current user via `@CurrentUser()` decorator

### Code Style

**Import order:**
1. NestJS imports
2. Third-party imports
3. Local imports (use absolute paths from `src/`)

**Formatting:**
- Single quotes for strings
- Trailing commas
- Semicolons required
- 2-space indentation
- Max line length: 120 characters

**Naming:**
- Classes: PascalCase (e.g., `AuthController`, `UserService`)
- Methods/variables: camelCase (e.g., `findAll`, `createUser`)
- Files: kebab-case (e.g., `auth.service.ts`, `create-user.dto.ts`)
- DTOs: PascalCase + `Dto` suffix (e.g., `LoginDto`, `RegisterDto`)
- Guards: PascalCase + `Guard` suffix (e.g., `AuthGuard`, `RolesGuard`)

### Global Configuration

**API Setup (main.ts):**
- Base URL: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/api/docs`
- CORS enabled for `http://localhost:3000`
- Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`
- Static files served at `/files` (maps to `uploads/` directory)

**Environment Variables (.env):**
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/db"
JWT_SECRET="your-jwt-secret"
JWT_EXPIRATION="7d"
PORT=3000

# Seed data (admin user)
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="Admin123!"
ADMIN_NAME="Administrator"
```

### Important Patterns & Quirks

**Soft Delete:**
- Documents use `deletedAt` field (null = active, timestamp = deleted)
- Soft-deleted documents moved to `uploads/trash/`
- Always filter by `deletedAt: null` for active documents
- Restore sets `deletedAt: null` and moves file back from trash

**Document Versioning:**
- `currentVersion` field tracks latest version number
- New versions increment `currentVersion` and create `DocumentVersion` record
- Version files stored in separate `versions/` directory

**File Integrity:**
- SHA256 checksums stored in `checksumSHA256` field
- Use `StorageService.calculateFileHash()` and `verifyFileIntegrity()`

**Pagination:**
- Use `QueryDto` pattern with `page` and `limit` query params
- Return format: `{ data: [...], meta: { total, page, limit, totalPages } }`

**Thumbnail Conventions:**
- Document thumbnails: Use document ID (positive)
- Template thumbnails: Use negative template ID (e.g., template 5 → -5)
- Check existence with `ThumbnailService.getThumbnailPath(id)`

**Template Field Validation:**
- Templates define `fields.fields[]` with `required` boolean
- Validate form data against template schema in `createDocumentFromTemplate()`
- Generate sample data for previews based on field types

### Common Tasks

**Adding a new module:**
```bash
nest g module <name>
nest g controller <name>
nest g service <name>
```

**Creating a migration:**
```bash
# 1. Edit prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name add_new_field
# 3. Prisma Client is auto-regenerated
```

**Testing uploads locally:**
- Upload directory: `uploads/`
- Access files at: `http://localhost:3000/files/<path>`
- Example: Document at `uploads/active/2025/01/15/file.pdf` → `http://localhost:3000/files/active/2025/01/15/file.pdf`

**Running single test:**
```bash
npm run test -- src/auth/auth.service.spec.ts
npm run test -- --testNamePattern="should login successfully"
```

## API Documentation

All API endpoints are documented in Swagger at `/api/docs` when running the dev server.

**Key endpoint groups:**
- `/api/auth` - Authentication (login, register, profile)
- `/api/users` - User management (admin only for some endpoints)
- `/api/documents` - Document CRUD, upload, download, versioning, soft-delete
- `/api/document-templates` - Template CRUD, document generation, preview
- `/api/categories` - Category management
- `/api/sections` - Section management

**Authentication:**
All endpoints require JWT Bearer token except those marked with `@Public()` decorator (e.g., `/api/auth/login`, `/api/auth/register`).

**Authorization:**
- Admin users can access all resources
- Regular users can only access their own resources (with some exceptions for public documents/templates)
- Role checks enforced by `RolesGuard` with `@Roles()` decorator
