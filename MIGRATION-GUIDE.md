# Guía de Migración - Sistema de Almacenamiento Estructurado

## 📋 Resumen de Cambios

Se ha implementado un nuevo sistema de almacenamiento local estructurado que incluye:

- ✅ **Estructura jerárquica** de carpetas por año/mes/día/usuario/categoría
- ✅ **Soft delete** (papelera de reciclaje)
- ✅ **Versionado automático** de documentos
- ✅ **Verificación de integridad** con checksums SHA256
- ✅ **Auditoría completa** de acciones (descargas, modificaciones, eliminaciones)
- ✅ **Limpieza automática** con cronjobs
- ✅ **Archivado automático** de documentos antiguos

---

## 🚀 Pasos para Migrar

### **1. Instalar Dependencias**

```bash
npm install @nestjs/schedule
```

### **2. Generar y Aplicar Migración de Base de Datos**

```bash
# Generar migración desde los cambios en el schema de Prisma
npx prisma migrate dev --name add-storage-system

# Aplicar migración
npx prisma generate
```

### **3. Migrar Archivos Existentes**

**IMPORTANTE: Antes de ejecutar, haz un backup de la carpeta `uploads/`**

```bash
# Backup (recomendado)
cp -r uploads uploads-backup

# Ejecutar migración
npx ts-node scripts/migrate-storage.ts
```

Esto moverá todos los archivos existentes a la nueva estructura:
```
uploads/
├── active/2025/01/15/users/user_abc/categories/cat_1/archivo.pdf
├── archive/
├── trash/
├── temp/
└── thumbnails/
```

### **4. Iniciar el Servidor**

```bash
npm run start:dev
```

Los cronjobs se ejecutarán automáticamente en los horarios configurados.

---

## 📂 Nueva Estructura de Almacenamiento

```
uploads/
├── active/                    # Documentos activos (< 90 días)
│   └── {año}/
│       └── {mes}/
│           └── {día}/
│               ├── users/
│               │   └── {userId}/
│               │       ├── categories/
│               │       │   ├── cat_{categoryId}/
│               │       │   │   └── {uuid}.pdf
│               │       │   └── uncategorized/
│               │       └── versions/
│               │           └── {uuid}_v1.pdf
│               ├── public/            # Documentos públicos
│               └── temp/              # Archivos temporales
│
├── archive/                   # Documentos archivados (> 90 días)
│   └── (misma estructura que active)
│
├── trash/                     # Papelera (soft delete)
│   └── 2025-01-15_doc42_archivo.pdf
│
├── thumbnails/                # Miniaturas generadas
│   └── {año}/{mes}/{uuid}_thumb.jpg
│
└── backups/                   # Backups automáticos
    ├── daily/
    ├── weekly/
    └── monthly/
```

---

## 🆕 Nuevos Endpoints API

### **Gestión de Versiones**

```http
# Obtener historial de versiones
GET /api/documents/:id/versions

# Restaurar versión anterior
POST /api/documents/:id/versions/:version/restore
```

### **Gestión de Papelera**

```http
# Mover a papelera (soft delete)
DELETE /api/documents/:id

# Restaurar desde papelera
POST /api/documents/:id/restore

# Eliminar permanentemente (solo ADMIN)
DELETE /api/documents/:id/permanent
```

---

## ⏰ Cronjobs Configurados

| Frecuencia | Hora | Tarea | Descripción |
|------------|------|-------|-------------|
| **Cada hora** | - | Limpieza temp | Elimina archivos temporales > 1 hora |
| **Diario** | 2 AM | Limpieza papelera | Elimina documentos en papelera > 30 días |
| **Diario** | 3 AM | Archivado | Mueve documentos > 90 días a /archive |
| **Mensual** | 4 AM | Limpieza auditoría | Elimina logs de auditoría > 1 año |
| **Semanal** | 5 AM (Domingo) | Verificación integridad | Verifica checksums de 100 documentos |

---

## 🔍 Verificar que Todo Funciona

### **1. Probar Upload**

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test.pdf" \
  -F "categoryId=1" \
  -F "description=Test"
```

Verificar que el archivo se creó en:
```
uploads/active/2025/01/XX/users/USER_ID/categories/cat_1/UUID.pdf
```

### **2. Verificar Base de Datos**

```sql
-- Ver versiones creadas
SELECT * FROM "DocumentVersion";

-- Ver documentos con checksums
SELECT id, filename, "checksumSHA256", "currentVersion" FROM "Document";

-- Ver logs de auditoría
SELECT * FROM "DocumentAccess" ORDER BY "createdAt" DESC LIMIT 10;
```

### **3. Verificar Cronjobs**

Los logs mostrarán:
```
[CleanupService] 🧹 Iniciando limpieza de archivos temporales...
[CleanupService] ✅ Limpieza completada: X archivos eliminados
```

---

## 🛠️ Solución de Problemas

### **Error: "Cannot find module '@nestjs/schedule'"**

```bash
npm install @nestjs/schedule
```

### **Error en migración de archivos**

Si el script de migración falla:

1. Verificar que `uploads/` existe
2. Restaurar desde backup: `cp -r uploads-backup/* uploads/`
3. Revisar permisos: `chmod -R 755 uploads/`
4. Ejecutar nuevamente: `npx ts-node scripts/migrate-storage.ts`

### **Archivos no se encuentran después de migración**

Verificar que la BD se actualizó correctamente:

```sql
SELECT path FROM "Document" WHERE id = X;
```

El `path` debe apuntar a `/uploads/active/...`

---

## 📊 Monitoreo

### **Verificar espacio en disco**

```bash
# Linux/Mac
df -h uploads/

# Windows
dir uploads /s
```

### **Ver estadísticas de documentos**

```http
GET /api/documents/stats
Authorization: Bearer YOUR_TOKEN
```

---

## ⚠️ Notas Importantes

1. **Backups**: Los archivos en `uploads/trash/` se eliminan permanentemente después de 30 días
2. **Archivo**: Los documentos se mueven automáticamente a `/archive/` después de 90 días
3. **Versiones**: Cada vez que reemplazas un archivo, se guarda la versión anterior
4. **Checksums**: Se verifican automáticamente en cada descarga
5. **Auditoría**: Todos los accesos quedan registrados en `DocumentAccess`

---

## 🔄 Rollback (si es necesario)

Si necesitas revertir los cambios:

```bash
# 1. Restaurar archivos
rm -rf uploads/
mv uploads-backup uploads/

# 2. Revertir migración de BD
npx prisma migrate reset

# 3. Restaurar código anterior
git revert HEAD
```

---

## ✅ Checklist Post-Migración

- [ ] Dependencias instaladas (`@nestjs/schedule`)
- [ ] Migración de BD aplicada
- [ ] Script de migración ejecutado sin errores
- [ ] Archivos migrados a nueva estructura
- [ ] Servidor reiniciado
- [ ] Upload de prueba funciona
- [ ] Versiones se crean correctamente
- [ ] Soft delete funciona (papelera)
- [ ] Cronjobs ejecutándose
- [ ] Backup de `uploads/` original guardado

---

## 📞 Soporte

Si encuentras problemas, revisa los logs:

```bash
# Ver logs del servidor
npm run start:dev

# Ver logs de cronjobs en tiempo real
# Buscar líneas con [CleanupService]
```
