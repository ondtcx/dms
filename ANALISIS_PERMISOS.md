# Análisis y Propuestas de Mejora: Sistema de Permisos

Este documento contiene un análisis arquitectónico de la gestión actual de permisos en el proyecto DMS Fullstack, junto con propuestas de mejora ordenadas por nivel de complejidad.

## Estado Actual

Actualmente, el sistema utiliza una combinación compleja de diferentes paradigmas de control de acceso:

1.  **RBAC (Roles Base):** 10 roles estáticos (`rector`, `profesor`, `padre`, etc.) definidos en el enum de Prisma.
2.  **ABAC (Atributos):** Permisos basados en relaciones (ej. documentos que pertenecen al mismo `departmentId` o `courseId` del usuario).
3.  **ACL (Listas de Control de Acceso):** El modelo `DocumentPermission` que otorga acceso explícito por documento a usuarios, roles o departamentos específicos.
4.  **Permisos Temporales:** El modelo `DocumentShare` para enlaces públicos o accesos con fecha de caducidad.

Tener esta lógica dispersa en *Guards*, *Services* (ej. `buildDocumentAccessFilter`) y consultas complejas en Prisma genera un sistema propenso a errores (brechas de seguridad) y posibles cuellos de botella en rendimiento a medida que la base de datos crece.

---

## Propuestas de Mejora y Análisis de Complejidad

A continuación, se detallan las propuestas ordenadas desde la más sencilla de implementar hasta la más compleja.

### 🟢 1. Separar la "Resolución" de la "Asignación" (Endpoint de Explicación)
**Complejidad: BAJA (1-2 días de trabajo)**

*   **Descripción:** Crear un nuevo endpoint exclusivo para administradores (ej. `GET /api/permissions/explain?userId=X&documentId=Y`).
*   **¿Por qué?** Actualmente, si un documento no se muestra, es muy difícil depurar por qué. Este endpoint utilizaría la lógica existente para retornar un árbol de decisión (array de *strings*) con las razones paso a paso por las cuales un usuario tiene o no acceso a un recurso (ej. "Es propietario", "El documento es público", "Tiene un DocumentPermission activo").
*   **Riesgo:** Nulo. Al ser una operación de solo lectura, no rompe ni interfiere con la lógica existente.

### 🟡 2. Aplanar el Sistema de Roles mediante "Claims" (Permisos Granulares)
**Complejidad: MEDIA (1 semana de trabajo)**

*   **Descripción:** Reducir los 10 roles estáticos a categorías básicas (`ADMIN`, `STAFF`, `STUDENT`, `PARENT`) y utilizar "Claims" o etiquetas de permisos granulares (ej. `CAN_APPROVE_FINANCIAL`, `CAN_MANAGE_USERS`) asignados al usuario o a un nuevo modelo `RolePermission`.
*   **¿Por qué?** El modelo actual tiene roles muy específicos (ej. `rector` vs `vicerrector` donde la única diferencia es el acceso a temas legales/financieros). Crear roles estáticos en base de datos por cada cargo no escala. Con *claims*, si se crea un nuevo cargo (ej. "Coordinador Financiero"), no hay que modificar el enum de la base de datos ni los *Guards*; solo se asignan los *claims* correspondientes.
*   **Riesgo:** Medio. Requiere modificar el `schema.prisma`, actualizar los decoradores (ej. reemplazar `@Roles()` por `@RequireClaims()`) y buscar/reemplazar los usos de roles específicos en el código.

### 🟡 3. Consolidar Shares y Permisos Explícitos
**Complejidad: MEDIA-ALTA (1-2 semanas de trabajo)**

*   **Descripción:** Unificar los modelos `DocumentPermission` y `DocumentShare` bajo un solo concepto (ej. `AccessGrant`), utilizando `Share` exclusivamente para enlaces externos sin autenticación (`isPublicLink`).
*   **¿Por qué?** Ambos modelos sirven para otorgar acceso a terceros. Un `Share` interno para un usuario de la plataforma es conceptualmente idéntico a un `DocumentPermission` temporal. Mantenerlos separados duplica la lógica y puede generar conflictos de acceso.
*   **Riesgo:** Alto (a nivel de datos). Requiere escribir un *script de migración de datos* muy cuidadoso para unificar los registros sin que los usuarios pierdan acceso a sus documentos ni se exponga información confidencial. También requiere refactorizar el frontend.

### 🔴 4. Migrar a un Motor de Políticas Centralizado (CASL / ZanAuth)
**Complejidad: ALTA (2-3 semanas de trabajo mínimo)**

*   **Descripción:** Integrar una librería como **CASL (`@casl/ability`)** para definir todas las reglas de acceso en un solo lugar (ej. `ability.factory.ts`) usando reglas legibles por humanos (ej. `can('read', 'Document', { isPublic: true })`).
*   **¿Por qué?** Centraliza y estandariza la evaluación de permisos tanto para proteger *endpoints* en el backend como para ocultar elementos en el frontend.
*   **Riesgo:** Alto. Es una reescritura sustancial de la capa de seguridad. Impacta el núcleo de la aplicación, ya que actualmente la lógica está acoplada a las consultas de Prisma (`buildDocumentAccessFilter`). Requiere reescribir los *Guards* y refactorizar casi todos los métodos del `DocumentService`.

### 🔴 5. Denormalizar los Permisos de Lectura (Flat ACL)
**Complejidad: MUY ALTA (3-4 semanas de trabajo)**

*   **Descripción:** Añadir una columna `readAccess: String[]` a la tabla `Document` (similar al `searchVector`) donde se guarden directamente los IDs de los usuarios, roles o departamentos que pueden ver el documento. La consulta de Prisma pasaría de ser una estructura compleja de `OR/AND` a un simple: `where: { readAccess: { hasSome: [user.id, user.role, user.departmentId] } }`.
*   **¿Por qué?** Las consultas actuales con múltiples `OR` y `JOINs` anidados matarán el rendimiento de PostgreSQL a medida que la base de datos crezca.
*   **Riesgo:** Medio/Alto. El gran desafío es la **sincronización**. Si cambian los permisos de un usuario (ej. es removido de un curso), se deben actualizar en segundo plano los arrays `readAccess` de todos los documentos afectados. Requiere implementar un sistema de colas robusto (como BullMQ) para mantener la consistencia de los datos.

---

## Plan de Ataque Recomendado

Si el proyecto está en producción o cerca de estarlo, se recomienda implementar las mejoras en fases:

1.  **Fase 1 (Corto plazo):** Implementar el endpoint de `/explain` (Propuesta 1). Dará visibilidad inmediata para depurar problemas de acceso con un esfuerzo mínimo.
2.  **Fase 2 (Mediano plazo):** Implementar los Claims/Permisos granulares (Propuesta 2). Dará flexibilidad para añadir nuevos tipos de empleados sin tener que redesplegar y modificar el código fuertemente tipado.
3.  **Fase 3 (Largo plazo):** La optimización de lectura (Flat ACL - Propuesta 5) solo debería implementarse cuando el monitoreo indique que los endpoints de listado de documentos (`GET /documents`) están sufriendo problemas de rendimiento debido al tamaño de las tablas. No se recomienda optimizar esto prematuramente a menos que ya existan cuellos de botella demostrados.
