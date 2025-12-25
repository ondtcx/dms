import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupDuplicateTemplates() {
  console.log('🔍 Buscando plantillas duplicadas...');

  // Obtener todas las plantillas agrupadas por nombre
  const templates = await prisma.documentTemplate.findMany({
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });

  const templatesByName = new Map<string, typeof templates>();

  templates.forEach((template) => {
    if (!templatesByName.has(template.name)) {
      templatesByName.set(template.name, []);
    }
    templatesByName.get(template.name)!.push(template);
  });

  let duplicatesFound = 0;
  let duplicatesDeleted = 0;

  for (const [name, duplicates] of templatesByName.entries()) {
    if (duplicates.length > 1) {
      duplicatesFound += duplicates.length - 1;
      console.log(
        `\n📋 Plantilla "${name}" tiene ${duplicates.length} duplicados:`,
      );

      // Mantener el primero (más antiguo), eliminar el resto
      const [keep, ...toDelete] = duplicates;
      console.log(`   ✅ Manteniendo: ID ${keep.id} (creado: ${keep.createdAt})`);

      for (const template of toDelete) {
        console.log(
          `   ❌ Eliminando: ID ${template.id} (creado: ${template.createdAt})`,
        );
        await prisma.documentTemplate.delete({
          where: { id: template.id },
        });
        duplicatesDeleted++;
      }
    }
  }

  console.log(`\n📊 Resumen:`);
  console.log(`   Total de plantillas únicas: ${templatesByName.size}`);
  console.log(`   Duplicados encontrados: ${duplicatesFound}`);
  console.log(`   Duplicados eliminados: ${duplicatesDeleted}`);

  if (duplicatesDeleted === 0) {
    console.log('\n✅ No se encontraron plantillas duplicadas.');
  } else {
    console.log('\n✅ Limpieza completada exitosamente.');
  }
}

cleanupDuplicateTemplates()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
