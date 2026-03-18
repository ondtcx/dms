# Sistema de Permisos — DMS Educativo

## 1. Resumen del modelo

El sistema usa **ReBAC (Relationship-Based Access Control)**: el acceso a los documentos se determina por las relaciones naturales del usuario dentro de la institución educativa, no por tablas de permisos configurables.

### Qué se eliminó y por qué

| Componente eliminado | Motivo |
|----------------------|--------|
| Tabla `Permission` | Los roles son estáticos (enum). Definir sus capacidades en BD añadía complejidad sin valor dinámico real |
| Tabla `RolePermission` | Mapeo rol→permiso nunca evaluado en runtime; las reglas están ahora en código |
| `PermissionsGuard` | Guard definido pero nunca registrado globalmente |
| `@RequirePermission()` | Decorator sin ningún uso en controllers |
| `scripts/seed-permissions.ts` | Script que poblaba las tablas eliminadas |
| `SaveSearchDto` | Dead code desde el inicio (no existía endpoint que lo usara) |

### Qué se conserva

| Componente | Propósito |
|------------|-----------|
| `DocumentPermission` (tabla) | Grants explícitos para casos fuera de las relaciones naturales |
| `PermissionService` | Métodos para otorgar, revocar y consultar permisos de documentos |
| `PermissionController` | 3 endpoints para gestionar `DocumentPermission` |
| `AuthGuard` + `RolesGuard` | Control de acceso a endpoints (no cambia) |
| `buildDocumentAccessFilter()` | Función pura que genera el filtro Prisma por rol |

---

## 2. Acceso por rol

El filtro se construye en `src/auth/utils/document-access.filter.ts` y se aplica en `DocumentService` y `SearchService`.

| Rol | Ve documentos de... | Relación utilizada |
|-----|---------------------|--------------------|
| **ADMIN** | Todo, sin restricción | — |
| **DIRECTOR** | Todo, sin restricción | — |
| **COORDINADOR** | Propios + públicos + cursos de su departamento + docs subidos por usuarios de su departamento + grants explícitos | `User.departmentId` → `Course.departmentId` |
| **PROFESOR** | Propios + públicos + cursos que imparte + materias que imparte + grants explícitos | `UserCourse`, `UserSubject` |
| **SECRETARIO** | Propios + públicos + docs subidos por usuarios de su departamento + grants explícitos | `User.departmentId` |
| **ESTUDIANTE** | Propios + docs **públicos** de cursos/materias en los que está inscrito + grants explícitos | `UserCourse`, `UserSubject` |
| **PADRE** | Docs públicos + grants explícitos | — |
| **MODERADOR / USER** | Propios + públicos + grants explícitos | — |

> **Nota sobre ESTUDIANTE:** La inscripción a cursos se gestiona a través de `UserCourse` (mismo modelo que los profesores). El campo `UserCourse.role` diferencia entre `"TEACHER"` y `"STUDENT"` si se requiere distinción futura.

---

## 3. `DocumentPermission` — Grants explícitos

Permite otorgar acceso a un documento específico **fuera** de las relaciones naturales. Por ejemplo: compartir un acta de dirección con un profesor de otro departamento.

### Modelo

```prisma
model DocumentPermission {
  documentId   Int
  userId       String?     // Usuario específico (o null)
  role         UserRole?   // Rol completo (o null)
  departmentId Int?        // Departamento completo (o null)
  canView      Boolean     @default(true)
  canEdit      Boolean     @default(false)
  canDelete    Boolean     @default(false)
  canShare     Boolean     @default(false)
  grantedById  String      // Quién otorgó el permiso
  expiresAt    DateTime?   // Expiración opcional
}
```

Al menos uno de `userId`, `role` o `departmentId` debe estar presente.

### Jerarquía de prioridad al evaluar acceso

1. ADMIN / DIRECTOR → acceso garantizado
2. Propietario del documento (`uploadedById`)
3. Relaciones naturales según rol (ver tabla anterior)
4. `DocumentPermission` explícito con `canView: true` y sin expirar

---

## 4. API de permisos de documentos

Todos los endpoints requieren JWT. Los de escritura requieren rol `ADMIN`, `DIRECTOR` o `COORDINADOR`.

### `POST /permissions/documents/:id/grant`
Otorga permiso sobre el documento con ID `:id`.

**Body:**
```json
{
  "userId": "clxyz...",         // opcional — usuario específico
  "role": "profesor",           // opcional — todos los usuarios con ese rol
  "departmentId": 3,            // opcional — todo el departamento
  "canView": true,
  "canEdit": false,
  "canDelete": false,
  "canShare": false,
  "expiresAt": "2026-12-31T23:59:59Z"  // opcional
}
```

**Respuesta 201:**
```json
{
  "id": 42,
  "documentId": 7,
  "userId": "clxyz...",
  "canView": true,
  "canEdit": false,
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "grantedBy": { "id": "...", "name": "Ana García", "email": "..." }
}
```

---

### `DELETE /permissions/documents/permissions/:id`
Revoca el permiso con ID `:id` (ID del registro `DocumentPermission`, no del documento).

**Respuesta 200:**
```json
{ "message": "Permiso de documento revocado exitosamente" }
```

---

### `GET /permissions/documents/:id`
Lista todos los `DocumentPermission` del documento con ID `:id`.

**Respuesta 200:** array de permisos con datos del usuario, departamento y quien otorgó el acceso.

---

## 5. Agregar un nuevo rol

Si se añade un nuevo valor al enum `UserRole` (en `prisma/schema.prisma` y `src/auth/role.enum.ts`), hay que:

1. **Añadir el case al switch** en `src/auth/utils/document-access.filter.ts`:

```typescript
case UserRole.NUEVO_ROL:
  return {
    OR: [
      ...baseAccess,          // propios + públicos + grants explícitos
      // ... reglas específicas del nuevo rol
    ],
  };
```

2. **Ejecutar migración** si el enum cambia en el schema:
```bash
npx prisma migrate dev --name add_nuevo_rol
```

3. **Actualizar este documento** con la nueva fila en la tabla de acceso por rol.

> Si no se añade un `case` explícito, el nuevo rol cae en el `default` que solo ve documentos propios + públicos + grants explícitos — comportamiento conservador y seguro.
