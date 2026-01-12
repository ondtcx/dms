import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultDepartments = [
  {
    name: 'Dirección General',
    code: 'DIR',
    description: 'Dirección general de la institución educativa',
    color: '#dc2626', // Red
    icon: 'Building2',
    isActive: true,
  },
  {
    name: 'Departamento Académico',
    code: 'ACAD',
    description: 'Gestión académica y coordinación de programas educativos',
    color: '#2563eb', // Blue
    icon: 'GraduationCap',
    isActive: true,
  },
  {
    name: 'Departamento Administrativo',
    code: 'ADMIN',
    description: 'Gestión administrativa y operativa',
    color: '#16a34a', // Green
    icon: 'Briefcase',
    isActive: true,
  },
  {
    name: 'Recursos Humanos',
    code: 'RRHH',
    description: 'Gestión de personal y recursos humanos',
    color: '#9333ea', // Purple
    icon: 'Users',
    isActive: true,
  },
  {
    name: 'Tecnología e Informática',
    code: 'TIC',
    description: 'Departamento de tecnología de la información',
    color: '#0891b2', // Cyan
    icon: 'Monitor',
    isActive: true,
  },
  {
    name: 'Biblioteca',
    code: 'BIB',
    description: 'Servicios bibliotecarios y recursos educativos',
    color: '#ca8a04', // Yellow/Amber
    icon: 'BookOpen',
    isActive: true,
  },
  {
    name: 'Servicios Estudiantiles',
    code: 'SERV-EST',
    description: 'Servicios de apoyo y bienestar estudiantil',
    color: '#db2777', // Pink
    icon: 'Heart',
    isActive: true,
  },
  {
    name: 'Finanzas',
    code: 'FIN',
    description: 'Gestión financiera y contabilidad',
    color: '#65a30d', // Lime
    icon: 'DollarSign',
    isActive: true,
  },
];

async function main() {
  console.log('🌱 Iniciando seeding de departamentos...');

  for (const dept of defaultDepartments) {
    try {
      // Verificar si ya existe
      const existing = await prisma.department.findFirst({
        where: {
          OR: [{ code: dept.code }, { name: dept.name }],
        },
      });

      if (existing) {
        console.log(`⏭️  Departamento "${dept.name}" ya existe, omitiendo...`);
        continue;
      }

      // Crear departamento
      const created = await prisma.department.create({
        data: dept,
      });

      console.log(`✅ Departamento creado: ${created.name} (${created.code})`);
    } catch (error) {
      console.error(`❌ Error al crear departamento "${dept.name}":`, error);
    }
  }

  console.log('\n🎉 Seeding de departamentos completado!');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
