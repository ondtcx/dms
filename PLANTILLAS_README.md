# Sistema de Plantillas de Documentos

Sistema para crear plantillas de documentos personalizables y generar documentos a partir de formularios.

## Características Principales

- ✅ Crear plantillas de documentos con campos personalizados
- ✅ Tipos predefinidos: actas, certificados, informes, memorándums, solicitudes, etc.
- ✅ Generación de documentos desde formularios validados
- ✅ Control de acceso por usuario y rol
- ✅ Gestión completa CRUD de plantillas
- ✅ Validación automática de campos requeridos

## Inicio Rápido

### 1. Ejecutar Migraciones

```bash
npx prisma migrate dev
```

### 2. Cargar Plantillas de Ejemplo

```bash
npm run seed
```

Esto creará 8 plantillas predefinidas:
- Acta de Reunión
- Certificado de Trabajo
- Informe Técnico
- Memorándum
- Solicitud de Vacaciones
- Orden de Compra
- Reporte de Incidentes
- Constancia de Estudio

### 3. Usar las Rutas

#### Listar plantillas disponibles
```bash
GET /document-templates
```

#### Crear un documento desde una plantilla
```bash
POST /documents/from-template
Content-Type: application/json

{
  "templateId": 1,
  "formData": {
    "titulo": "Reunión de planificación",
    "fecha": "2024-01-15",
    "participantes": "Juan, María, Carlos",
    ...
  }
}
```

## Rutas Disponibles

### Gestión de Plantillas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/document-templates` | Crear nueva plantilla |
| GET | `/document-templates` | Listar plantillas (con filtros) |
| GET | `/document-templates/types` | Obtener tipos de plantillas |
| GET | `/document-templates/:id` | Obtener plantilla específica |
| PATCH | `/document-templates/:id` | Actualizar plantilla |
| DELETE | `/document-templates/:id` | Eliminar plantilla |

### Generación de Documentos

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/documents/from-template` | Crear documento desde formulario |

## Ejemplo de Plantilla

```json
{
  "name": "Acta de Reunión",
  "type": "acta",
  "description": "Plantilla para actas de reunión",
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
        "label": "Fecha",
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

## Tipos de Campos Soportados

- `text` - Texto simple
- `textarea` - Texto multilínea
- `date` - Fecha
- `time` - Hora
- `number` - Número
- `email` - Correo electrónico

## Validación Automática

El sistema valida automáticamente:
- ✅ Que la plantilla exista y esté activa
- ✅ Que todos los campos requeridos estén presentes
- ✅ Que el usuario tenga permisos para usar la plantilla

## Estructura de Documento Generado

Los documentos se guardan como archivos JSON:

```json
{
  "template": {
    "id": 1,
    "name": "Acta de Reunión",
    "type": "acta"
  },
  "formData": {
    "titulo": "Reunión de equipo",
    "fecha": "2024-01-15",
    ...
  },
  "generatedAt": "2024-01-25T14:32:03.456Z"
}
```

## Permisos

### Usuarios Normales
- Pueden ver plantillas activas y las que ellos crearon
- Pueden crear documentos desde plantillas activas
- Solo pueden editar/eliminar sus propias plantillas

### Administradores
- Acceso completo a todas las plantillas
- Pueden activar/desactivar plantillas
- Pueden ver documentos de todos los usuarios

## Documentación Completa

Para documentación detallada de la API, consulta:
- [DOCUMENT_TEMPLATES_API.md](./DOCUMENT_TEMPLATES_API.md) - Documentación completa de endpoints

## Flujo de Trabajo Típico

1. **Crear o seleccionar una plantilla**
   ```bash
   GET /document-templates?type=acta
   ```

2. **Ver los campos requeridos de la plantilla**
   ```bash
   GET /document-templates/1
   ```

3. **Generar el documento con los datos del formulario**
   ```bash
   POST /documents/from-template
   {
     "templateId": 1,
     "formData": { ... }
   }
   ```

4. **Descargar el documento generado**
   ```bash
   GET /documents/{id}/download
   ```

## Próximas Mejoras Sugeridas

- [ ] Generación de PDFs desde plantillas
- [ ] Plantillas con archivos Word/Excel (docxtemplater)
- [ ] Sistema de versionado de plantillas
- [ ] Validaciones personalizadas por tipo de campo
- [ ] Previsualización de documentos
- [ ] Exportación en múltiples formatos

## Soporte

Para más información sobre el módulo de documentos base, consulta la documentación del sistema de gestión documental.
