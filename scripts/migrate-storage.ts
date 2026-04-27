// @ts-nocheck
/**
 * Script de migración para mover documentos existentes a estructura organizada
 *
 * Uso: npx ts-node scripts/migrate-storage.ts
 */

import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

const prisma = new PrismaClient();

// Función para calcular SHA256
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => reject(error));
  });
}

// Función para generar ruta estructurada
function generateStructuredPath(
  userId: string,
  categoryId: number | null,
  filename: string,
  date: Date,
): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return join(
    './uploads/active',
    String(year),
    month,
    day,
    'users',
    userId,
    'categories',
    categoryId ? `cat_${categoryId}` : 'uncategorized',
    filename,
  );
}

// Función principal
async function migrateStorage() {
  console.log('🚀 Iniciando migración de almacenamiento...\n');

  try {
    // 1. Obtener todos los documentos
    const documents = await prisma.document.findMany({
      include: {
        uploadedBy: true,
      },
    });

    console.log(`📊 Total de documentos a migrar: ${documents.length}\n`);

    let migrated = 0;
    let errors = 0;
    let skipped = 0;

    for (const doc of documents) {
      try {
        // Verificar si el archivo existe
        if (!existsSync(doc.path)) {
          console.log(`⚠️  Archivo no existe (saltando): ${doc.filename}`);
          skipped++;
          continue;
        }

        // Verificar si ya está en estructura nueva
        if (doc.path.includes('/active/') || doc.path.includes('/archive/')) {
          console.log(`✓  Ya migrado (saltando): ${doc.filename}`);
          skipped++;
          continue;
        }

        // Generar nueva ruta estructurada
        const newPath = generateStructuredPath(
          doc.uploadedById,
          doc.categoryId,
          doc.storedName,
          doc.createdAt,
        );

        // Crear directorios si no existen
        const dir = dirname(newPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Copiar archivo a nueva ubicación
        copyFileSync(doc.path, newPath);

        // Calcular checksum
        const checksum = await calculateFileHash(newPath);

        // Actualizar registro en BD
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            path: newPath,
            checksumSHA256: checksum,
          },
        });

        // Crear versión inicial si no existe
        const existingVersion = await prisma.documentVersion.findUnique({
          where: {
            documentId_version: {
              documentId: doc.id,
              version: 1,
            },
          },
        });

        if (!existingVersion) {
          await prisma.documentVersion.create({
            data: {
              documentId: doc.id,
              version: 1,
              storedName: doc.storedName,
              path: newPath,
              size: doc.size,
              checksumSHA256: checksum,
              comment: 'Versión inicial (migración)',
              createdById: doc.uploadedById,
            },
          });
        }

        // Eliminar archivo antiguo
        try {
          unlinkSync(doc.path);
        } catch (err) {
          console.warn(`⚠️  No se pudo eliminar archivo antiguo: ${doc.path}`);
        }

        migrated++;
        console.log(`✅ Migrado [${migrated}/${documents.length}]: ${doc.filename}`);
      } catch (error) {
        errors++;
        console.error(`❌ Error en documento ${doc.id} (${doc.filename}):`, error.message);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(60));
    console.log(`✅ Documentos migrados:  ${migrated}`);
    console.log(`⚠️  Documentos saltados:  ${skipped}`);
    console.log(`❌ Errores encontrados:  ${errors}`);
    console.log(`📊 Total procesados:     ${documents.length}`);
    console.log('='.repeat(60));

    if (errors === 0 && migrated > 0) {
      console.log('\n🎉 Migración completada exitosamente!');
    } else if (errors > 0) {
      console.log('\n⚠️  Migración completada con errores. Revise los logs.');
    } else {
      console.log('\n✓  No había documentos para migrar.');
    }
  } catch (error) {
    console.error('\n❌ Error fatal durante la migración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar migración
migrateStorage()
  .then(() => {
    console.log('\n✓ Proceso finalizado.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Proceso terminado con errores:', error);
    process.exit(1);
  });
