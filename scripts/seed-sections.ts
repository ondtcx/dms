import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSections() {
  console.log('🌱 Seeding sections...');

  const sections = [
    {
      name: 'Académico',
      description: 'Documentos relacionados con actividades académicas',
      color: '#3b82f6',
      icon: 'BookOpen',
      isActive: true,
    },
    {
      name: 'Administrativo',
      description: 'Documentos administrativos y de gestión',
      color: '#10b981',
      icon: 'Building2',
      isActive: true,
    },
    {
      name: 'Procesos',
      description: 'Documentación de procesos institucionales',
      color: '#f59e0b',
      icon: 'ClipboardList',
      isActive: true,
    },
    {
      name: 'Estudiantes',
      description: 'Documentos relacionados con estudiantes',
      color: '#8b5cf6',
      icon: 'GraduationCap',
      isActive: true,
    },
    {
      name: 'Personal Docente',
      description: 'Documentos del personal docente',
      color: '#ec4899',
      icon: 'Users',
      isActive: true,
    },
    {
      name: 'Calendario',
      description: 'Calendario académico y eventos',
      color: '#14b8a6',
      icon: 'Calendar',
      isActive: true,
    },
  ];

  for (const section of sections) {
    const existing = await prisma.section.findUnique({
      where: { name: section.name },
    });

    if (existing) {
      console.log(`⏭️  Sección "${section.name}" ya existe, saltando...`);
      continue;
    }

    await prisma.section.create({
      data: section,
    });
    console.log(`✅ Sección "${section.name}" creada`);
  }

  console.log('✨ Seeding completado');
}

seedSections()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
