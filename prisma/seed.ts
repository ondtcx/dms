import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../src/auth/role.enum';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Crear usuario ADMIN
  const hashedPassword = await bcrypt.hash('Admin123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {}, // No actualizar si ya existe
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      name: 'Administrador',
      role: UserRole.ADMIN,
    },
  });

  console.log('✅ Admin creado:', {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  // Opcional: Crear usuarios de ejemplo
  const user1 = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: await bcrypt.hash('User123!', 10),
      name: 'Usuario Normal',
      role: UserRole.USER,
    },
  });

  console.log('✅ Usuario normal creado:', {
    id: user1.id,
    email: user1.email,
    name: user1.name,
    role: user1.role,
  });

  console.log('🎉 Seed completado exitosamente!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
