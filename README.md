# DMS Backend — API de gestión documental

API REST del sistema de gestión documental para instituciones educativas. Vive en el directorio `dms-backend/` del monorepo `dms-fullstack` y es consumida por la aplicación web `dms-frontend`.

Gestiona el ciclo completo del documento: creación y carga, tipificación, versionado, composición, plantillas, flujos de aprobación, firma electrónica, búsqueda, compartición por directorios y trazabilidad de auditoría.

## Stack

| Componente | Versión |
| --- | --- |
| Node.js | 20 (`Dockerfile`) |
| NestJS | 10 (`@nestjs/common` 10.4, `@nestjs/core` 10, `@nestjs/platform-express` 10.4) |
| TypeScript | 5.1 |
| PostgreSQL + Prisma ORM | Prisma 6.2 |
| Autenticación | `@nestjs/jwt` 11, `bcrypt` |
| Documentación de API | `@nestjs/swagger` 8, Swagger UI |
| Pruebas | Jest 29, Supertest |
| Procesamiento documental | `pdf-lib`, `pdf-parse`, `mammoth`, `docxtemplater`, `exceljs`, `sharp`, `tesseract.js` |
| Firma electrónica | `@signpdf/*`, `node-forge` |
| Edición/visualización en línea | OnlyOffice, `docx-preview`, Puppeteer |

## Requisitos previos

- Node.js 20.
- PostgreSQL accesible desde `DATABASE_URL`.
- Chromium para la generación de miniaturas DOCX con Puppeteer. En desarrollo, Puppeteer descarga su propio navegador al instalar dependencias; la imagen Docker ya instala Chromium.
- Opcional: OnlyOffice Document Server para edición en línea.
- Opcional: modelo OCR en español, descargado con `npm run ocr:setup`.

## Puesta en marcha

```bash
cd dms-backend
npm install

# Variables de entorno
cp .env.example .env
# Edita .env con la conexión real a PostgreSQL y secretos propios

# Base de datos
npx prisma migrate dev
npm run seed

# Servidor en modo desarrollo
npm run start:dev
```

`npm run seed` también puede ejecutarse mediante `npx prisma db seed` (configurado en la sección `prisma` de `package.json`).

### Datos de ejemplo del seed

`prisma/seed.ts` crea o actualiza, de forma idempotente mediante `upsert`:

- Usuarios institucionales de demostración con roles `ADMIN`, `RECTOR`, `VICERRECTOR`, `COORDINADOR`, `SECRETARIO` y `PROFESOR` (`prisma/seed.ts:8-30`).
- Matriz de roles y permisos, categorías, tipos de documento, año académico y una plantilla de documento.

Las credenciales de esos usuarios están definidas en `prisma/seed.ts`. `npm run seed:documents` agrega documentos de ejemplo.

## Variables de entorno

Tomadas de `.env.example`:

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL. Si la contraseña contiene caracteres especiales, deben ir codificados (`@` → `%40`). | `postgresql://postgres:your_password@localhost:5432/dms?schema=public` |
| `PORT` | Puerto HTTP de la API. Si no se define, el proceso escucha en `3000` (`src/main.ts:72`). | `3001` |
| `JWT_SECRET` | Secreto de firma de los tokens JWT (`openssl rand -hex 64`). | `your-jwt-secret-here` |
| `JWT_EXPIRATION` | Vigencia del token emitido. | `30d` |
| `CATALOG_AUTHORIZATION_ENABLED` | Activa la autorización respaldada por catálogo; permanece deshabilitada hasta validar paridad. | `false` |
| `FILE_SECRET` | Secreto para URLs firmadas de archivos (`openssl rand -hex 64`). | `your-file-secret-here` |
| `API_URL` | URL pública de la API, usada en callbacks y referencias internas. | `http://localhost:3001/api` |
| `ONLYOFFICE_URL` | URL de OnlyOffice Document Server (opcional). | `http://localhost:8080` |
| `ONLYOFFICE_SECRET` | Secreto compartido con OnlyOffice. | `your-onlyoffice-secret-here` |
| `ONLYOFFICE_CALLBACK_HOST` | Host al que OnlyOffice devuelve los callbacks cuando corre en Docker. | `http://host.docker.internal:3001` |

El archivo `.env` no se versiona. No publiques secretos reales en el repositorio.

## Scripts disponibles

| Script | Qué hace |
| --- | --- |
| `npm run build` | Compila con Nest CLI a `dist/`. |
| `npm run start` | Ejecuta la aplicación sin observación de cambios. |
| `npm run start:dev` | Ejecuta en modo desarrollo con recarga automática. |
| `npm run start:debug` | Igual que `start:dev`, con depurador activo. |
| `npm run start:prod` | Ejecuta el artefacto compilado (`node dist/main`). |
| `npm run lint` | ESLint con corrección automática sobre `src`, `apps`, `libs` y `test`. |
| `npm run format` | Prettier sobre `src/**/*.ts` y `test/**/*.ts`. |
| `npm test` | Pruebas unitarias con Jest. |
| `npm run test:watch` | Jest en modo observación. |
| `npm run test:cov` | Jest con cobertura. |
| `npm run test:debug` | Jest con inspector de Node. |
| `npm run test:e2e` | Pruebas end-to-end con la configuración `test/jest-e2e.json`. |
| `npm run seed` | Datos iniciales (`prisma/seed.ts`). |
| `npm run seed:documents` | Documentos de ejemplo (`prisma/seed-documents.ts`). |
| `npm run backfill:page-count` | Recalcula el conteo de páginas de documentos existentes. |
| `npm run ocr:setup` | Descarga el modelo OCR en español y verifica su hash. |

## Estructura del proyecto

```txt
dms-backend/
├─ prisma/            # Esquema, migraciones y seeds
├─ src/               # Código de la aplicación
├─ test/              # Pruebas end-to-end y su configuración
├─ docs/              # Documentación de OCR y búsqueda
├─ scripts/           # Utilidades de operación (modelo OCR, backfills)
├─ uploads/           # Archivos subidos, servidos en /files
└─ Dockerfile
```

Módulos principales bajo `src/`:

| Módulo | Responsabilidad |
| --- | --- |
| `auth/` | Autenticación JWT, guards y capa de compatibilidad de autorización. |
| `user/`, `role/`, `permission/` | Usuarios, roles institucionales, permisos y asignaciones. |
| `document/` | Documentos, versiones, contenido, miniaturas y flujo de oficina. |
| `document-composition/` | Composición y ensamblado de documentos. |
| `document-template/` | Plantillas de documento y datos asociados. |
| `document-type/`, `category/`, `academic-year/` | Catálogos académicos. |
| `workflow/` | Plantillas de flujo, etapas, transiciones y aprobaciones. |
| `directory/` | Directorios, herencia y concesiones de acceso efectivas. |
| `document-change-request/` | Solicitudes de cambio sobre documentos. |
| `batch/` | Operaciones y lotes documentales. |
| `search/` | Búsqueda de texto completo e indexación. |
| `audit/` | Bitácora de auditoría. |
| `notification/` | Notificaciones y preferencias por usuario. |
| `onlyoffice/` | Edición en línea y recepción de callbacks. |
| `storage/` | Almacenamiento de archivos y protección de archivos de recepción. |
| `settings/` | Configuración del sistema. |
| `tasks/` | Tareas programadas. |
| `common/`, `config/`, `prisma/` | Utilidades transversales, configuración y acceso a datos. |

## Capacidades

- **Documentos y versionado**: alta, metadatos, versiones (`DocumentVersion`), comentarios, trazabilidad y papelera.
- **Tipificación y catálogos**: categorías, tipos de documento, secciones, años académicos, cursos y materias.
- **Plantillas**: plantillas de documento con datos y generación por lotes a partir de plantillas.
- **Flujos de trabajo**: plantillas versionadas, etapas, transiciones, aprobaciones y eventos; incluye solicitudes de cambio.
- **Firma electrónica**: firma de PDF con certificados P12/`node-forge`.
- **Búsqueda**: indexación de contenido, búsqueda de texto completo y OCR en español.
- **Compartición y permisos**: directorios con herencia, concesiones de acceso efectivas y compartición directa de documentos.
- **Recepción de documentos**: envíos de recepción con archivos protegidos.
- **Auditoría y notificaciones**: registro de auditoría, notificaciones y preferencias.
- **Edición en línea**: integración con OnlyOffice y previsualización de documentos de oficina.

## API y URLs locales

| Recurso | URL |
| --- | --- |
| API (prefijo global `api`, `src/main.ts:14`) | `http://localhost:3001/api` |
| Swagger UI (`src/main.ts:58`) | `http://localhost:3001/api/docs` |
| Archivos subidos (`src/app.module.ts:36-39`) | `http://localhost:3001/files` |

CORS habilitado con credenciales para `http://localhost:3000` (frontend), `http://localhost:8080` (OnlyOffice) y los hosts `host.docker.internal` (`src/main.ts:16-24`).

La validación global de entrada usa `ValidationPipe` con `whitelist` y `forbidNonWhitelisted`, por lo que las propiedades no declaradas en los DTO se rechazan.

## Pruebas

```bash
# Suite completa de pruebas unitarias
npm test

# Un archivo de prueba específico
npx jest --runTestsByPath src/auth/auth.service.spec.ts

# Cobertura
npm run test:cov

# End-to-end
npm run test:e2e
```

Las pruebas unitarias viven junto al código como `*.spec.ts` dentro de `src/` (93 archivos al momento de esta documentación) y Jest las descubre con `testRegex: .*\.spec\.ts$` y `rootDir: src`. Las pruebas end-to-end están en `test/` y cubren la aplicación base, documentos, roles, flujos de trabajo, configuración centralizada y el backfill de catálogo de roles.

## Docker

```bash
docker build -t dms-backend .
docker run --env-file .env -p 3001:3001 dms-backend
```

La imagen parte de `node:20-bookworm-slim`, instala Chromium y sus fuentes para Puppeteer, compila el proyecto y arranca `node dist/main.js` exponiendo el puerto `3001`.

## Documentación relacionada

- [`docs/ocr.md`](./docs/ocr.md) — preparación del modelo OCR y comportamiento esperado.
- [`docs/search.md`](./docs/search.md) — búsqueda de texto completo e indexación.
- [`SWAGGER_GUIDE.md`](./SWAGGER_GUIDE.md) — uso de la documentación Swagger.
- [`DOCUMENT_TEMPLATES_API.md`](./DOCUMENT_TEMPLATES_API.md) — API de plantillas de documento.
- [`MIGRATION-GUIDE.md`](./MIGRATION-GUIDE.md) — guía de migración de datos.
- [`../docs/architecture/backend.md`](../docs/architecture/backend.md) — arquitectura del backend dentro del monorepo.
- [`../docs/development/getting-started.md`](../docs/development/getting-started.md) — puesta en marcha del monorepo completo.
