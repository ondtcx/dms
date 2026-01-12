import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultWorkflowTemplates = [
  {
    name: 'Aprobación Simple - Coordinador',
    description:
      'Workflow simple que requiere aprobación de un coordinador',
    documentType: null,
    categoryId: null,
    stateDefinitions: [
      {
        state: 'pending_coordinador',
        role: 'coordinador',
        order: 0,
        requiresComment: false,
      },
    ],
    autoAssign: true,
    requiresComment: false,
    isActive: true,
  },
  {
    name: 'Aprobación Doble - Coordinador y Director',
    description:
      'Workflow que requiere aprobación de coordinador y luego director',
    documentType: null,
    categoryId: null,
    stateDefinitions: [
      {
        state: 'pending_coordinador',
        role: 'coordinador',
        order: 0,
        requiresComment: false,
      },
      {
        state: 'pending_director',
        role: 'director',
        order: 1,
        requiresComment: true,
      },
    ],
    autoAssign: true,
    requiresComment: false,
    isActive: true,
  },
  {
    name: 'Aprobación de Documentos Académicos',
    description:
      'Workflow para aprobar documentos académicos (calificaciones, certificados, etc.)',
    documentType: 'certificado',
    categoryId: null,
    stateDefinitions: [
      {
        state: 'pending_profesor',
        role: 'profesor',
        order: 0,
        requiresComment: false,
      },
      {
        state: 'pending_coordinador',
        role: 'coordinador',
        order: 1,
        requiresComment: false,
      },
      {
        state: 'pending_director',
        role: 'director',
        order: 2,
        requiresComment: true,
      },
    ],
    autoAssign: true,
    requiresComment: false,
    isActive: true,
  },
  {
    name: 'Aprobación de Documentos Administrativos',
    description:
      'Workflow para aprobar documentos administrativos que requieren validación del secretario',
    documentType: 'administrativo',
    categoryId: null,
    stateDefinitions: [
      {
        state: 'pending_secretario',
        role: 'secretario',
        order: 0,
        requiresComment: false,
      },
      {
        state: 'pending_coordinador',
        role: 'coordinador',
        order: 1,
        requiresComment: false,
      },
    ],
    autoAssign: true,
    requiresComment: false,
    isActive: true,
  },
  {
    name: 'Revisión y Moderación de Contenido',
    description:
      'Workflow para revisar contenido antes de publicación, requiere moderador',
    documentType: null,
    categoryId: null,
    stateDefinitions: [
      {
        state: 'pending_moderador',
        role: 'moderador',
        order: 0,
        requiresComment: true,
      },
      {
        state: 'pending_coordinador',
        role: 'coordinador',
        order: 1,
        requiresComment: false,
      },
    ],
    autoAssign: true,
    requiresComment: true,
    isActive: true,
  },
  {
    name: 'Aprobación Rápida - Solo Director',
    description:
      'Workflow directo que solo requiere aprobación del director',
    documentType: null,
    categoryId: null,
    stateDefinitions: [
      {
        state: 'pending_director',
        role: 'director',
        order: 0,
        requiresComment: false,
      },
    ],
    autoAssign: true,
    requiresComment: false,
    isActive: true,
  },
];

async function main() {
  console.log('🌱 Iniciando seeding de plantillas de workflow...\n');

  let createdCount = 0;
  let skippedCount = 0;

  for (const template of defaultWorkflowTemplates) {
    try {
      // Verificar si ya existe
      const existing = await prisma.workflowTemplate.findUnique({
        where: { name: template.name },
      });

      if (existing) {
        console.log(
          `⏭️  Plantilla "${template.name}" ya existe, omitiendo...`,
        );
        skippedCount++;
        continue;
      }

      // Crear plantilla
      const created = await prisma.workflowTemplate.create({
        data: template,
      });

      console.log(`✅ Plantilla creada: ${created.name}`);
      console.log(
        `   - Estados: ${(created.stateDefinitions as any[]).length}`,
      );
      console.log(
        `   - Roles: ${(created.stateDefinitions as any[]).map((s: any) => s.role).join(' → ')}`,
      );
      console.log('');
      createdCount++;
    } catch (error) {
      console.error(
        `❌ Error al crear plantilla "${template.name}":`,
        error,
      );
    }
  }

  console.log(
    `\n📊 Plantillas creadas: ${createdCount}, omitidas: ${skippedCount}\n`,
  );
  console.log('🎉 Seeding de plantillas de workflow completado!\n');

  // Mostrar resumen
  const totalTemplates = await prisma.workflowTemplate.count();
  console.log(`📋 Total de plantillas en el sistema: ${totalTemplates}`);
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
