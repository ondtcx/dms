import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing deprecated JSON role fields...');
  
  await prisma.$executeRawUnsafe(`UPDATE "Category" SET "allowedRoles" = NULL`);
  await prisma.$executeRawUnsafe(`UPDATE "WorkflowTemplate" SET "allowedInitiatorRoles" = NULL, "stateDefinitions" = NULL`);
  
  console.log('Cleared fields successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });