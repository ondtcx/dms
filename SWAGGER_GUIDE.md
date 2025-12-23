# Guía de Swagger - Sistema de Gestión Documental

## Acceso a la Documentación

Una vez que la aplicación esté corriendo, puedes acceder a la documentación interactiva de Swagger en:

```
http://localhost:3000/api/docs
```

## Características de la Documentación

### 1. Interfaz Interactiva
- **Exploración visual** de todos los endpoints disponibles
- **Prueba en vivo** de las APIs directamente desde el navegador
- **Ejemplos de peticiones y respuestas** para cada endpoint
- **Esquemas de datos** con validaciones y tipos

### 2. Secciones Organizadas

La documentación está organizada en las siguientes secciones (tags):

#### 🔐 auth
Endpoints de autenticación
- Login
- Registro
- Refresh token

#### 👤 users
Gestión de usuarios
- CRUD de usuarios
- Gestión de perfiles
- Cambio de contraseñas

#### 📁 documents
Gestión de documentos
- Subir documentos
- Listar documentos
- Descargar documentos
- Actualizar metadata
- Eliminar documentos
- **Crear documentos desde plantillas** ⭐

#### 📋 document-templates
Gestión de plantillas de documentos
- Crear plantillas personalizadas
- Listar plantillas (con filtros)
- Obtener tipos de plantillas
- Actualizar plantillas
- Eliminar plantillas

## Cómo Usar Swagger

### Paso 1: Autenticación

1. **Obtener un token JWT:**
   - Ve a la sección `auth`
   - Expande el endpoint `POST /api/auth/login`
   - Haz clic en "Try it out"
   - Ingresa las credenciales:
     ```json
     {
       "email": "admin@example.com",
       "password": "Admin123!"
     }
     ```
   - Haz clic en "Execute"
   - Copia el `access_token` de la respuesta

2. **Autorizar Swagger:**
   - Haz clic en el botón **"Authorize"** (candado verde) en la parte superior
   - Pega el token en el campo de valor
   - Haz clic en "Authorize"
   - Cierra el modal

Ahora todas las peticiones incluirán automáticamente el token de autenticación.

### Paso 2: Explorar las Plantillas

#### Listar Plantillas Disponibles

1. Ve a la sección `document-templates`
2. Expande `GET /api/document-templates`
3. Haz clic en "Try it out"
4. (Opcional) Configura filtros:
   - `search`: "acta"
   - `isActive`: true
   - `page`: 1
   - `limit`: 10
5. Haz clic en "Execute"
6. Revisa la respuesta con las plantillas disponibles

#### Ver Tipos de Plantillas

1. Expande `GET /api/document-templates/types`
2. Haz clic en "Try it out" y "Execute"
3. Verás una lista de tipos con su conteo:
   ```json
   [
     { "type": "acta", "count": 3 },
     { "type": "certificado", "count": 5 }
   ]
   ```

#### Obtener Detalles de una Plantilla

1. Expande `GET /api/document-templates/{id}`
2. Haz clic en "Try it out"
3. Ingresa el ID de la plantilla (ej: 1)
4. Haz clic en "Execute"
5. Revisa los campos definidos en `fields.fields`

### Paso 3: Crear un Documento desde Plantilla

1. Ve a la sección `documents`
2. Expande `POST /api/documents/from-template`
3. Haz clic en "Try it out"
4. Selecciona un ejemplo del dropdown o ingresa tus datos:

**Ejemplo - Acta de Reunión:**
```json
{
  "templateId": 1,
  "formData": {
    "titulo": "Reunión de planificación Q1 2024",
    "fecha": "2024-01-15",
    "hora_inicio": "09:00",
    "hora_fin": "11:30",
    "lugar": "Sala de conferencias",
    "participantes": "Juan, María, Carlos",
    "agenda": "Revisión de objetivos",
    "desarrollo": "Se discutieron los objetivos",
    "acuerdos": "Implementar mejoras"
  },
  "filename": "acta-reunion-2024-01-15.json",
  "description": "Acta de reunión de planificación",
  "isPublic": false
}
```

5. Haz clic en "Execute"
6. Revisa la respuesta con el documento creado

### Paso 4: Crear una Plantilla Personalizada

1. Ve a `POST /api/document-templates`
2. Haz clic en "Try it out"
3. Ingresa los datos de tu plantilla:

```json
{
  "name": "Evaluación de Desempeño",
  "type": "evaluacion",
  "description": "Plantilla para evaluaciones anuales",
  "fields": {
    "fields": [
      {
        "name": "empleado",
        "label": "Nombre del empleado",
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
        "name": "comentarios",
        "label": "Comentarios",
        "type": "textarea",
        "required": false
      }
    ]
  },
  "isActive": true
}
```

4. Haz clic en "Execute"
5. Guarda el ID de la plantilla creada para usarla después

## Ejemplos de Uso por Tipo de Plantilla

### Acta de Reunión (ID: 1)
```json
{
  "templateId": 1,
  "formData": {
    "titulo": "Reunión Trimestral",
    "fecha": "2024-01-15",
    "hora_inicio": "09:00",
    "hora_fin": "11:00",
    "lugar": "Sala Principal",
    "participantes": "Juan, María, Carlos",
    "agenda": "1. Objetivos\n2. Presupuesto",
    "desarrollo": "Se revisaron los objetivos...",
    "acuerdos": "1. Aprobar presupuesto\n2. Siguiente reunión"
  }
}
```

### Certificado de Trabajo (ID: 2)
```json
{
  "templateId": 2,
  "formData": {
    "nombre_empleado": "Juan Pérez García",
    "identificacion": "12345678-9",
    "cargo": "Desarrollador Senior",
    "fecha_ingreso": "2020-03-15",
    "fecha_retiro": "2024-01-30",
    "funciones": "Desarrollo de aplicaciones web",
    "observaciones": "Excelente desempeño"
  }
}
```

### Informe Técnico (ID: 3)
```json
{
  "templateId": 3,
  "formData": {
    "titulo": "Análisis de Rendimiento",
    "fecha": "2024-01-20",
    "autor": "Carlos López",
    "resumen_ejecutivo": "Análisis del rendimiento del sistema",
    "introduccion": "Se evaluó el rendimiento...",
    "objetivo": "Evaluar el rendimiento del sistema",
    "metodologia": "Pruebas de carga con JMeter",
    "resultados": "Tiempo de respuesta: 250ms",
    "conclusiones": "El sistema cumple los objetivos",
    "recomendaciones": "Implementar caché Redis"
  }
}
```

### Memorándum (ID: 4)
```json
{
  "templateId": 4,
  "formData": {
    "numero": "MEM-2024-001",
    "fecha": "2024-01-22",
    "para": "Todo el personal",
    "de": "Dirección",
    "asunto": "Actualización de políticas",
    "contenido": "Se comunica que..."
  }
}
```

## Validaciones Automáticas

Swagger muestra las validaciones en tiempo real:

### Campos Requeridos
Si intentas crear un documento sin los campos requeridos, obtendrás:
```json
{
  "statusCode": 400,
  "message": "Faltan campos requeridos: titulo, fecha, participantes"
}
```

### Plantilla Inactiva
Si intentas usar una plantilla inactiva:
```json
{
  "statusCode": 400,
  "message": "La plantilla no está activa"
}
```

### Plantilla No Encontrada
Si el templateId no existe:
```json
{
  "statusCode": 404,
  "message": "Plantilla no encontrada"
}
```

## Tipos de Campos Soportados

Al crear plantillas, puedes usar estos tipos de campos:

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| `text` | Texto simple | "Juan Pérez" |
| `textarea` | Texto multilínea | "Descripción\nlarga" |
| `date` | Fecha | "2024-01-15" |
| `time` | Hora | "14:30" |
| `number` | Número | 123.45 |
| `email` | Correo electrónico | "user@example.com" |

## Códigos de Estado HTTP

Swagger documenta todos los códigos de estado posibles:

| Código | Significado |
|--------|-------------|
| 200 | OK - Operación exitosa |
| 201 | Created - Recurso creado |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - No autenticado |
| 403 | Forbidden - Sin permisos |
| 404 | Not Found - Recurso no encontrado |
| 500 | Internal Server Error - Error del servidor |

## Descargar Especificación OpenAPI

Puedes descargar la especificación completa en formato JSON:

```
http://localhost:3000/api/docs-json
```

Esta especificación puede importarse en herramientas como:
- Postman
- Insomnia
- Bruno
- REST Client (VS Code)

## Consejos de Uso

### 1. Usa los Ejemplos
Cada endpoint tiene ejemplos predefinidos. Úsalos como punto de partida.

### 2. Explora los Esquemas
En la sección "Schemas" (al final) puedes ver la estructura completa de cada DTO.

### 3. Prueba con Datos Reales
Después de familiarizarte con los ejemplos, prueba con tus propios datos.

### 4. Revisa las Respuestas
Cada respuesta incluye un ejemplo de lo que recibirás. Úsalo para entender la estructura.

### 5. Mantén tu Token Actualizado
Si recibes errores 401, probablemente tu token expiró. Vuelve a hacer login.

## Integración con Frontend

Una vez que pruebes los endpoints en Swagger, puedes usarlos en tu frontend:

```typescript
// Ejemplo en TypeScript/JavaScript
const createDocumentFromTemplate = async (data) => {
  const response = await fetch('http://localhost:3000/api/documents/from-template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  return response.json();
};
```

## Solución de Problemas

### Error: "Unauthorized"
- Verifica que hayas autorizado Swagger con un token válido
- Verifica que el token no haya expirado

### Error: "Faltan campos requeridos"
- Revisa la definición de la plantilla en `GET /api/document-templates/{id}`
- Asegúrate de incluir todos los campos marcados como `required: true`

### Error: "Plantilla no encontrada"
- Verifica que el `templateId` sea correcto
- Verifica que la plantilla exista con `GET /api/document-templates`

### No aparece el botón "Authorize"
- Recarga la página
- Verifica que el servidor esté corriendo correctamente

## Recursos Adicionales

- [Documentación de NestJS Swagger](https://docs.nestjs.com/openapi/introduction)
- [Especificación OpenAPI](https://swagger.io/specification/)
- [Guía de uso del sistema](./PLANTILLAS_README.md)
- [Documentación completa de la API](./DOCUMENT_TEMPLATES_API.md)
