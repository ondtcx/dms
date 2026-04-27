import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const PERMISSIONS = [
  { action: 'role:admin', description: 'Access reserved for admin role' },
  { action: 'role:rector', description: 'Access reserved for rector role' },
  {
    action: 'role:vicerrector',
    description: 'Access reserved for vicerrector role',
  },
  {
    action: 'role:coordinador',
    description: 'Access reserved for coordinador role',
  },
  { action: 'role:profesor', description: 'Access reserved for profesor role' },
  {
    action: 'role:secretario',
    description: 'Access reserved for secretario role',
  },
  { action: 'role:moderador', description: 'Access reserved for moderador role' },
  { action: 'users:read', description: 'View user list and details' },
  { action: 'users:write', description: 'Create and update users' },
  { action: 'users:delete', description: 'Delete users' },
  { action: 'roles:read', description: 'View roles and permissions' },
  { action: 'roles:write', description: 'Create and update roles' },
  { action: 'roles:delete', description: 'Delete roles' },
  { action: 'documents:read:all', description: 'Read all documents in the system' },
  { action: 'documents:write:all', description: 'Modify any document' },
  { action: 'documents:delete:all', description: 'Delete any document' },
  { action: 'departments:read', description: 'View departments' },
  { action: 'departments:write', description: 'Manage departments' },
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  rector: ['users:read', 'users:write', 'roles:read', 'documents:read:all', 'documents:write:all', 'departments:read', 'departments:write'],
  vicerrector: ['users:read', 'documents:read:all', 'departments:read'],
  coordinador: ['users:read', 'documents:read:all', 'departments:read'],
  profesor: ['users:read', 'departments:read'],
  secretario: ['users:read', 'users:write', 'documents:read:all', 'departments:read'],
  padre: [],
  estudiante: [],
  moderador: ['users:read', 'documents:read:all', 'documents:delete:all'],
  admin: ['users:read', 'users:write', 'users:delete', 'roles:read', 'roles:write', 'roles:delete', 'documents:read:all', 'documents:write:all', 'documents:delete:all', 'departments:read', 'departments:write'],
  user: [],
};

async function main() {
  console.log('Seeding RBAC permissions...');

  // 1. Create missing roles (if any didn't migrate via SQL)
  const allRoles = Object.keys(ROLE_PERMISSIONS);
  for (const roleName of allRoles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `Role ${roleName}`,
        isSystem: true,
      },
    });
  }

  // 2. Create permissions
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { action: p.action },
      update: { description: p.description },
      create: p,
    });
  }

  // 3. Assign permissions to roles
  for (const [roleName, actions] of Object.entries(ROLE_PERMISSIONS)) {
    if (actions.length > 0) {
      await prisma.role.update({
        where: { name: roleName },
        data: {
          permissions: {
            connect: [...new Set([...actions, `role:${roleName}`])].map((action) => ({ action })),
          },
        },
      });
    }
  }

  console.log('RBAC seeding completed.');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
