# API de Plantillas de Documentos

Esta documentación describe las rutas disponibles para el sistema de plantillas de documentos y generación de documentos desde formularios.

## Tabla de Contenidos

- [Autenticación](#autenticación)
- [Gestión de Plantillas](#gestión-de-plantillas)
- [Generación de Documentos](#generación-de-documentos)
- [Ejemplos de Uso](#ejemplos-de-uso)

---

## Autenticación

Todas las rutas requieren autenticación mediante JWT Bearer Token.

```http
Authorization: Bearer <tu-token-jwt>
```

---

## Gestión de Plantillas

### 1. Crear una Plantilla

Crea una nueva plantilla de documento con campos personalizados.

**Endpoint:** `POST /document-templates`

**Permisos:** Usuario autenticado

**Body:**
```json
{
  "name": "Acta de Reunión",
  "type": "acta",
  "description": "Plantilla para registrar las actas de reuniones",
  "fields": {
    "fields": [
      {
        "name": "titulo",
        "label": "Título de la reunión",
        "type": "text",
        "required": true
      },
      {
        "name": "fecha",
        "label": "Fecha de la reunión",
        "type": "date",
        "required": true
      },
      {
        "name": "participantes",
        "label": "Participantes",
        "type": "textarea",
        "required": true
      }
    ]
  },
  "isActive": true
}
```

**Tipos de campos soportados:**
- `text` - Campo de texto simple
- `textarea` - Campo de texto multilínea
- `date` - Campo de fecha
- `time` - Campo de hora
- `number` - Campo numérico
- `email` - Campo de correo electrónico
- `select` - Lista desplegable (requiere campo `options`)

**Respuesta exitosa (201):**
```json
{
  "id": 1,
  "name": "Acta de Reunión",
  "type": "acta",
  "description": "Plantilla para registrar las actas de reuniones",
  "fields": { ... },
  "isActive": true,
  "createdById": "cmhtlluz80000eba0by5adzbj",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z",
  "createdBy": {
    "id": "cmhtlluz80000eba0by5adzbj",
    "name": "Administrador",
    "email": "admin@example.com"
  }
}
```

---

### 2. Listar Plantillas

Obtiene una lista paginada de plantillas con filtros opcionales.

**Endpoint:** `GET /document-templates`

**Permisos:**
- Usuarios normales: Solo ven plantillas activas o las que ellos crearon
- Admin: Ve todas las plantillas

**Query Parameters:**

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `search` | string | No | - | Busca por nombre o tipo |
| `type` | string | No | - | Filtra por tipo de plantilla |
| `isActive` | boolean | No | - | Filtra por estado activo |
| `page` | number | No | 1 | Número de página |
| `limit` | number | No | 10 | Elementos por página |

**Ejemplo de petición:**
```http
GET /document-templates?search=acta&isActive=true&page=1&limit=10
```

**Respuesta exitosa (200):**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Acta de Reunión",
      "type": "acta",
      "description": "Plantilla para registrar las actas de reuniones",
      "fields": { ... },
      "isActive": true,
      "createdById": "cmhtlluz80000eba0by5adzbj",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z",
      "createdBy": {
        "id": "cmhtlluz80000eba0by5adzbj",
        "name": "Administrador",
        "email": "admin@example.com"
      },
      "_count": {
        "documents": 5
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### 3. Obtener Tipos de Plantillas

Obtiene una lista de todos los tipos de plantillas disponibles con su conteo.

**Endpoint:** `GET /document-templates/types`

**Permisos:** Usuario autenticado

**Respuesta exitosa (200):**
```json
[
  {
    "type": "acta",
    "count": 3
  },
  {
    "type": "certificado",
    "count": 5
  },
  {
    "type": "informe",
    "count": 2
  }
]
```

---

### 4. Obtener una Plantilla Específica

Obtiene los detalles completos de una plantilla por su ID.

**Endpoint:** `GET /document-templates/:id`

**Permisos:**
- Usuarios normales: Solo pueden ver plantillas activas o las que crearon
- Admin: Puede ver todas

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | number | ID de la plantilla |

**Ejemplo de petición:**
```http
GET /document-templates/1
```

**Respuesta exitosa (200):**
```json
{
  "id": 1,
  "name": "Acta de Reunión",
  "type": "acta",
  "description": "Plantilla para registrar las actas de reuniones",
  "fields": {
    "fields": [
      {
        "name": "titulo",
        "label": "Título de la reunión",
        "type": "text",
        "required": true
      },
      {
        "name": "fecha",
        "label": "Fecha de la reunión",
        "type": "date",
        "required": true
      }
    ]
  },
  "isActive": true,
  "createdById": "cmhtlluz80000eba0by5adzbj",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:00:00.000Z",
  "createdBy": {
    "id": "cmhtlluz80000eba0by5adzbj",
    "name": "Administrador",
    "email": "admin@example.com"
  },
  "_count": {
    "documents": 5
  }
}
```

**Respuesta de error (404):**
```json
{
  "statusCode": 404,
  "message": "Plantilla no encontrada"
}
```

**Respuesta de error (403):**
```json
{
  "statusCode": 403,
  "message": "No tienes permiso para ver esta plantilla"
}
```

---

### 5. Actualizar una Plantilla

Actualiza los datos de una plantilla existente.

**Endpoint:** `PATCH /document-templates/:id`

**Permisos:**
- Solo el creador de la plantilla o un admin pueden actualizarla

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | number | ID de la plantilla |

**Body (todos los campos son opcionales):**
```json
{
  "name": "Acta de Reunión Actualizada",
  "description": "Nueva descripción",
  "isActive": false,
  "fields": {
    "fields": [
      {
        "name": "nuevo_campo",
        "label": "Nuevo Campo",
        "type": "text",
        "required": false
      }
    ]
  }
}
```

**Respuesta exitosa (200):**
```json
{
  "id": 1,
  "name": "Acta de Reunión Actualizada",
  "type": "acta",
  "description": "Nueva descripción",
  "fields": { ... },
  "isActive": false,
  "createdById": "cmhtlluz80000eba0by5adzbj",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T11:30:00.000Z",
  "createdBy": {
    "id": "cmhtlluz80000eba0by5adzbj",
    "name": "Administrador",
    "email": "admin@example.com"
  }
}
```

---

### 6. Eliminar una Plantilla

Elimina una plantilla de forma permanente.

**Endpoint:** `DELETE /document-templates/:id`

**Permisos:**
- Solo el creador de la plantilla o un admin pueden eliminarla

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `id` | number | ID de la plantilla |

**Respuesta exitosa (200):**
```json
{
  "message": "Plantilla eliminada exitosamente"
}
```

**Nota:** Los documentos creados con esta plantilla se mantendrán, pero el campo `templateId` se establecerá en `null`.

---

## Generación de Documentos

### Crear Documento desde Plantilla

Crea un nuevo documento a partir de un formulario basado en una plantilla existente.

**Endpoint:** `POST /documents/from-template`

**Permisos:** Usuario autenticado

**Body:**
```json
{
  "templateId": 1,
  "formData": {
    "titulo": "Reunión de planificación Q1 2024",
    "fecha": "2024-01-15",
    "hora_inicio": "09:00",
    "hora_fin": "11:00",
    "lugar": "Sala de conferencias A",
    "participantes": "Juan Pérez, María García, Carlos López",
    "agenda": "1. Revisión de objetivos\n2. Asignación de tareas\n3. Próximos pasos",
    "desarrollo": "Se revisaron los objetivos del trimestre...",
    "acuerdos": "1. Implementar nuevo sistema\n2. Capacitación al equipo"
  },
  "filename": "acta-reunion-2024-01-15.json",
  "description": "Acta de reunión de planificación trimestral",
  "isPublic": false
}
```

**Campos del body:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `templateId` | number | Sí | ID de la plantilla a usar |
| `formData` | object | Sí | Datos del formulario según la definición de la plantilla |
| `filename` | string | No | Nombre del archivo (se genera automáticamente si no se proporciona) |
| `description` | string | No | Descripción del documento |
| `isPublic` | boolean | No | Si el documento es público (default: false) |

**Validaciones:**
- La plantilla debe existir y estar activa
- Todos los campos marcados como `required: true` en la plantilla deben estar presentes en `formData`
- El sistema valida automáticamente los campos requeridos

**Respuesta exitosa (201):**
```json
{
  "id": 42,
  "filename": "acta-reunion-2024-01-15.json",
  "storedName": "1737800123456-acta-reunion-2024-01-15.json",
  "mimetype": "application/json",
  "size": 1024,
  "path": "/path/to/uploads/1737800123456-acta-reunion-2024-01-15.json",
  "description": "Acta de reunión de planificación trimestral",
  "isPublic": false,
  "uploadedById": "cmhtlluz80000eba0by5adzbj",
  "templateId": 1,
  "formData": {
    "titulo": "Reunión de planificación Q1 2024",
    "fecha": "2024-01-15",
    ...
  },
  "createdAt": "2024-01-25T14:32:03.456Z",
  "updatedAt": "2024-01-25T14:32:03.456Z",
  "uploadedBy": {
    "id": "cmhtlluz80000eba0by5adzbj",
    "name": "Administrador",
    "email": "admin@example.com"
  },
  "template": {
    "id": 1,
    "name": "Acta de Reunión",
    "type": "acta"
  }
}
```

**Contenido del archivo generado:**
El sistema genera un archivo JSON con la siguiente estructura:
```json
{
  "template": {
    "id": 1,
    "name": "Acta de Reunión",
    "type": "acta"
  },
  "formData": {
    "titulo": "Reunión de planificación Q1 2024",
    "fecha": "2024-01-15",
    ...
  },
  "generatedAt": "2024-01-25T14:32:03.456Z"
}
```

**Respuesta de error (404):**
```json
{
  "statusCode": 404,
  "message": "Plantilla no encontrada"
}
```

**Respuesta de error (400) - Plantilla inactiva:**
```json
{
  "statusCode": 400,
  "message": "La plantilla no está activa"
}
```

**Respuesta de error (400) - Campos faltantes:**
```json
{
  "statusCode": 400,
  "message": "Faltan campos requeridos: titulo, fecha, participantes"
}
```

---

## Ejemplos de Uso

### Ejemplo 1: Crear un Acta de Reunión

**1. Obtener la plantilla de acta:**
```bash
curl -X GET http://localhost:3000/document-templates/1 \
  -H "Authorization: Bearer <tu-token>"
```

**2. Crear el documento con los datos del formulario:**
```bash
curl -X POST http://localhost:3000/documents/from-template \
  -H "Authorization: Bearer <tu-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": 1,
    "formData": {
      "titulo": "Reunión de equipo - Enero 2024",
      "fecha": "2024-01-15",
      "hora_inicio": "09:00",
      "hora_fin": "10:30",
      "lugar": "Sala de conferencias",
      "participantes": "Juan, María, Carlos",
      "agenda": "Revisión de objetivos",
      "desarrollo": "Se discutieron los objetivos del mes",
      "acuerdos": "Implementar mejoras en el proceso"
    },
    "description": "Acta reunión de equipo enero",
    "isPublic": false
  }'
```

---

### Ejemplo 2: Crear una Plantilla Personalizada

```bash
curl -X POST http://localhost:3000/document-templates \
  -H "Authorization: Bearer <tu-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Evaluación de Desempeño",
    "type": "evaluacion",
    "description": "Plantilla para evaluaciones de desempeño",
    "fields": {
      "fields": [
        {
          "name": "empleado",
          "label": "Nombre del empleado",
          "type": "text",
          "required": true
        },
        {
          "name": "periodo",
          "label": "Periodo evaluado",
          "type": "text",
          "required": true
        },
        {
          "name": "calificacion",
          "label": "Calificación (1-5)",
          "type": "number",
          "required": true
        },
        {
          "name": "fortalezas",
          "label": "Fortalezas identificadas",
          "type": "textarea",
          "required": true
        },
        {
          "name": "areas_mejora",
          "label": "Áreas de mejora",
          "type": "textarea",
          "required": true
        },
        {
          "name": "comentarios",
          "label": "Comentarios adicionales",
          "type": "textarea",
          "required": false
        }
      ]
    },
    "isActive": true
  }'
```

---

### Ejemplo 3: Listar Plantillas por Tipo

```bash
curl -X GET "http://localhost:3000/document-templates?type=certificado&isActive=true" \
  -H "Authorization: Bearer <tu-token>"
```

---

### Ejemplo 4: Generar un Certificado de Trabajo

```bash
curl -X POST http://localhost:3000/documents/from-template \
  -H "Authorization: Bearer <tu-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": 2,
    "formData": {
      "nombre_empleado": "Juan Pérez García",
      "identificacion": "12345678-9",
      "cargo": "Desarrollador Senior",
      "fecha_ingreso": "2020-03-15",
      "funciones": "Desarrollo de aplicaciones web, revisión de código, mentoría a desarrolladores junior"
    },
    "filename": "certificado-juan-perez.json",
    "description": "Certificado laboral de Juan Pérez"
  }'
```

---

## Plantillas Predefinidas

El sistema incluye las siguientes plantillas de ejemplo (creadas mediante seed):

1. **Acta de Reunión** - `acta`
2. **Certificado de Trabajo** - `certificado`
3. **Informe Técnico** - `informe`
4. **Memorándum** - `memorandum`
5. **Solicitud de Vacaciones** - `solicitud`
6. **Orden de Compra** - `orden_compra`
7. **Reporte de Incidentes** - `reporte`
8. **Constancia de Estudio** - `certificado`

Para ver los detalles completos de cada plantilla, usa:
```bash
GET /document-templates
```

---

## Notas Importantes

1. **Permisos**: Los usuarios normales solo pueden ver plantillas activas o las que ellos crearon. Los administradores tienen acceso completo.

2. **Validación**: El sistema valida automáticamente que los datos del formulario cumplan con los campos requeridos definidos en la plantilla.

3. **Formato de almacenamiento**: Los documentos generados se guardan como archivos JSON estructurados que incluyen la información de la plantilla y los datos del formulario.

4. **Relación con documentos**: Los documentos creados mantienen una referencia a la plantilla usada mediante el campo `templateId`.

5. **Extensibilidad**: Puedes crear tus propias plantillas con campos personalizados según tus necesidades.

---

## Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | Operación exitosa |
| 201 | Recurso creado exitosamente |
| 400 | Solicitud inválida (campos faltantes, validación fallida) |
| 401 | No autenticado |
| 403 | Sin permisos suficientes |
| 404 | Recurso no encontrado |
| 500 | Error interno del servidor |
