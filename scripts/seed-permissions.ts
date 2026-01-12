import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Definición de permisos por recurso
const permissions = [
  // Documentos
  { name: 'documents.create', resource: 'documents', action: 'create', description: 'Crear documentos' },
  { name: 'documents.read', resource: 'documents', action: 'read', description: 'Ver documentos' },
  { name: 'documents.update', resource: 'documents', action: 'update', description: 'Actualizar documentos' },
  { name: 'documents.delete', resource: 'documents', action: 'delete', description: 'Eliminar documentos' },
  { name: 'documents.restore', resource: 'documents', action: 'restore', description: 'Restaurar documentos eliminados' },
  { name: 'documents.share', resource: 'documents', action: 'share', description: 'Compartir documentos' },

  // Plantillas de documentos
  { name: 'templates.create', resource: 'templates', action: 'create', description: 'Crear plantillas' },
  { name: 'templates.read', resource: 'templates', action: 'read', description: 'Ver plantillas' },
  { name: 'templates.update', resource: 'templates', action: 'update', description: 'Actualizar plantillas' },
  { name: 'templates.delete', resource: 'templates', action: 'delete', description: 'Eliminar plantillas' },

  // Usuarios
  { name: 'users.create', resource: 'users', action: 'create', description: 'Crear usuarios' },
  { name: 'users.read', resource: 'users', action: 'read', description: 'Ver usuarios' },
  { name: 'users.update', resource: 'users', action: 'update', description: 'Actualizar usuarios' },
  { name: 'users.delete', resource: 'users', action: 'delete', description: 'Eliminar usuarios' },

  // Departamentos
  { name: 'departments.create', resource: 'departments', action: 'create', description: 'Crear departamentos' },
  { name: 'departments.read', resource: 'departments', action: 'read', description: 'Ver departamentos' },
  { name: 'departments.update', resource: 'departments', action: 'update', description: 'Actualizar departamentos' },
  { name: 'departments.delete', resource: 'departments', action: 'delete', description: 'Eliminar departamentos' },

  // Cursos
  { name: 'courses.create', resource: 'courses', action: 'create', description: 'Crear cursos' },
  { name: 'courses.read', resource: 'courses', action: 'read', description: 'Ver cursos' },
  { name: 'courses.update', resource: 'courses', action: 'update', description: 'Actualizar cursos' },
  { name: 'courses.delete', resource: 'courses', action: 'delete', description: 'Eliminar cursos' },
  { name: 'courses.assign', resource: 'courses', action: 'assign', description: 'Asignar profesores a cursos' },

  // Materias
  { name: 'subjects.create', resource: 'subjects', action: 'create', description: 'Crear materias' },
  { name: 'subjects.read', resource: 'subjects', action: 'read', description: 'Ver materias' },
  { name: 'subjects.update', resource: 'subjects', action: 'update', description: 'Actualizar materias' },
  { name: 'subjects.delete', resource: 'subjects', action: 'delete', description: 'Eliminar materias' },
  { name: 'subjects.assign', resource: 'subjects', action: 'assign', description: 'Asignar profesores a materias' },

  // Categorías
  { name: 'categories.create', resource: 'categories', action: 'create', description: 'Crear categorías' },
  { name: 'categories.read', resource: 'categories', action: 'read', description: 'Ver categorías' },
  { name: 'categories.update', resource: 'categories', action: 'update', description: 'Actualizar categorías' },
  { name: 'categories.delete', resource: 'categories', action: 'delete', description: 'Eliminar categorías' },

  // Secciones
  { name: 'sections.create', resource: 'sections', action: 'create', description: 'Crear secciones' },
  { name: 'sections.read', resource: 'sections', action: 'read', description: 'Ver secciones' },
  { name: 'sections.update', resource: 'sections', action: 'update', description: 'Actualizar secciones' },
  { name: 'sections.delete', resource: 'sections', action: 'delete', description: 'Eliminar secciones' },
];

// Asignación de permisos por rol
// NOTA: ADMIN no necesita asignación explícita ya que tiene acceso total por código
const rolePermissions: Record<UserRole, string[]> = {
  admin: [], // No necesita, tiene todos por defecto

  director: [
    // Acceso completo a todo
    'documents.create', 'documents.read', 'documents.update', 'documents.delete', 'documents.restore', 'documents.share',
    'templates.create', 'templates.read', 'templates.update', 'templates.delete',
    'users.create', 'users.read', 'users.update', 'users.delete',
    'departments.create', 'departments.read', 'departments.update', 'departments.delete',
    'courses.create', 'courses.read', 'courses.update', 'courses.delete', 'courses.assign',
    'subjects.create', 'subjects.read', 'subjects.update', 'subjects.delete', 'subjects.assign',
    'categories.create', 'categories.read', 'categories.update', 'categories.delete',
    'sections.create', 'sections.read', 'sections.update', 'sections.delete',
  ],

  coordinador: [
    // Gestión de documentos y estructura académica de su departamento
    'documents.create', 'documents.read', 'documents.update', 'documents.delete', 'documents.share',
    'templates.read', 'templates.create',
    'users.read',
    'departments.read',
    'courses.create', 'courses.read', 'courses.update', 'courses.assign',
    'subjects.create', 'subjects.read', 'subjects.update', 'subjects.assign',
    'categories.read',
    'sections.read',
  ],

  profesor: [
    // Gestión de documentos de sus cursos/materias
    'documents.create', 'documents.read', 'documents.update', 'documents.share',
    'templates.read',
    'users.read',
    'departments.read',
    'courses.read',
    'subjects.read',
    'categories.read',
    'sections.read',
  ],

  secretario: [
    // Tareas administrativas
    'documents.create', 'documents.read', 'documents.update', 'documents.share',
    'templates.read', 'templates.create',
    'users.read',
    'departments.read',
    'courses.read',
    'subjects.read',
    'categories.read',
    'sections.read',
  ],

  moderador: [
    // Moderación de contenido
    'documents.read', 'documents.update', 'documents.delete',
    'templates.read',
    'users.read',
    'departments.read',
    'courses.read',
    'subjects.read',
    'categories.read',
    'sections.read',
  ],

  user: [
    // Usuario básico
    'documents.create', 'documents.read',
    'templates.read',
    'departments.read',
    'courses.read',
    'subjects.read',
    'categories.read',
    'sections.read',
  ],

  padre: [
    // Solo lectura de documentos de sus hijos
    'documents.read',
    'templates.read',
    'courses.read',
    'subjects.read',
  ],

  estudiante: [
    // Solo lectura de sus propios documentos
    'documents.read',
    'templates.read',
    'courses.read',
    'subjects.read',
  ],
};

async function main() {
  console.log('🌱 Iniciando seeding de permisos...\n');

  // Paso 1: Crear todos los permisos
  console.log('📝 Creando permisos...');
  let createdCount = 0;
  let skippedCount = 0;

  for (const perm of permissions) {
    try {
      const existing = await prisma.permission.findUnique({
        where: { name: perm.name },
      });

      if (existing) {
        console.log(`⏭️  Permiso "${perm.name}" ya existe, omitiendo...`);
        skippedCount++;
        continue;
      }

      await prisma.permission.create({
        data: perm,
      });

      console.log(`✅ Permiso creado: ${perm.name}`);
      createdCount++;
    } catch (error) {
      console.error(`❌ Error al crear permiso "${perm.name}":`, error);
    }
  }

  console.log(`\n📊 Permisos creados: ${createdCount}, omitidos: ${skippedCount}\n`);

  // Paso 2: Asignar permisos a roles
  console.log('👥 Asignando permisos a roles...\n');
  let assignedCount = 0;
  let assignSkippedCount = 0;

  for (const [role, permissionNames] of Object.entries(rolePermissions)) {
    if (permissionNames.length === 0) {
      console.log(`⏭️  Rol ${role} no requiere asignaciones explícitas\n`);
      continue;
    }

    console.log(`🔐 Procesando rol: ${role}`);

    for (const permName of permissionNames) {
      try {
        // Buscar el permiso por nombre
        const permission = await prisma.permission.findUnique({
          where: { name: permName },
        });

        if (!permission) {
          console.log(`⚠️  Permiso "${permName}" no encontrado para rol ${role}`);
          continue;
        }

        // Verificar si ya está asignado
        const existing = await prisma.rolePermission.findUnique({
          where: {
            role_permissionId: {
              role: role as UserRole,
              permissionId: permission.id,
            },
          },
        });

        if (existing) {
          assignSkippedCount++;
          continue;
        }

        // Asignar permiso al rol
        await prisma.rolePermission.create({
          data: {
            role: role as UserRole,
            permissionId: permission.id,
          },
        });

        assignedCount++;
      } catch (error) {
        console.error(
          `❌ Error al asignar permiso "${permName}" al rol ${role}:`,
          error,
        );
      }
    }

    console.log(`✅ Rol ${role} procesado\n`);
  }

  console.log(
    `📊 Asignaciones creadas: ${assignedCount}, omitidas: ${assignSkippedCount}\n`,
  );
  console.log('🎉 Seeding de permisos completado!\n');

  // Mostrar resumen por rol
  console.log('📋 RESUMEN DE PERMISOS POR ROL:\n');
  for (const role of Object.values(UserRole)) {
    const count = await prisma.rolePermission.count({
      where: { role },
    });
    console.log(`   ${role}: ${count} permisos`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
