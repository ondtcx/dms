# DMS Backend

API REST y núcleo de lógica de negocio del sistema documental.

## Responsabilidades

- autenticación y autorización,
- gestión documental y versionado,
- workflows de aprobación,
- permisos por rol, usuario y departamento,
- comentarios, notificaciones, shares y transferencias,
- estructura académica,
- storage local y publicación de archivos,
- configuración y reportes.

## Stack

- NestJS 10
- Prisma ORM
- PostgreSQL
- JWT
- Swagger/OpenAPI

## Módulos principales

- `auth`
- `user`
- `role`
- `permission`
- `document`
- `document-template`
- `document-type`
- `document-composition`
- `workflow`
- `notification`
- `comment`
- `share`
- `transfer`
- `batch`
- `search`
- `report`
- `settings`
- `academic-year`
- `category`
- `section`
- `department`
- `course`
- `subject`
- `storage`
- `tasks`
- `onlyoffice`

## Instalación

```bash
npm install
```

## Variables de entorno mínimas

```env
DATABASE_URL="postgresql://user:password@localhost:5432/dms"
JWT_SECRET="change-me"
JWT_EXPIRATION="7d"
PORT=3001
```

## Base de datos

Aplicar migraciones:

```bash
npx prisma migrate dev
```

Cargar datos iniciales:

```bash
npm run seed
```

## Desarrollo

```bash
npm run start:dev
```

- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/api/docs`
- Files: `http://localhost:3001/files`

## Scripts útiles

- `npm run start:dev`
- `npm run test`
- `npm run test:e2e`
- `npm run lint`
- `npm run seed`

## Documentación relacionada

- `../docs/architecture/backend.md`
- `../docs/architecture/database.md`
- `SWAGGER_GUIDE.md`
- `ANALISIS_PERMISOS.md`
- `DOCUMENT_TEMPLATES_API.md`
