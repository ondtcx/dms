import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--confirm');

const documentPatterns = [
  'review-',
  'shared-',
  'reviewer-',
  'sharing-',
  'transfer-',
  'notification-',
  'search-',
  'audit-',
  'workflow-disabled-',
  'reception-',
  'workflow-',
  'E2E Test Doc',
  'Oficio E2E',
  'Lote E2E',
  'Prueba ',
  'Documento con revisor',
  'Notificación E2E',
  'Documento de búsqueda',
  'Auditoría E2E',
];

const templatePatterns = ['Prueba ', 'E2E '];

const documents = await prisma.document.findMany({
  where: {
    deletedAt: null,
    OR: documentPatterns.map((pattern) => ({
      name: { contains: pattern, mode: 'insensitive' },
    })),
  },
  select: { id: true, name: true },
  orderBy: { id: 'asc' },
});

const templates = await prisma.documentTemplate.findMany({
  where: {
    isPredefined: false,
    OR: templatePatterns.map((pattern) => ({
      name: { contains: pattern, mode: 'insensitive' },
    })),
  },
  select: { id: true, name: true, isActive: true },
  orderBy: { id: 'asc' },
});

console.log(`documents matched: ${documents.length}`);
for (const document of documents) console.log(`  ${document.id} ${document.name}`);
console.log(`non-predefined templates matched: ${templates.length}`);
for (const template of templates) console.log(`  ${template.id} ${template.isActive ? 'active' : 'inactive'} ${template.name}`);

if (!apply) {
  console.log('Dry run. Re-run with --confirm to soft-delete documents and deactivate templates.');
  await prisma.$disconnect();
  process.exit(0);
}

const deletedDocuments = await prisma.document.updateMany({
  where: { id: { in: documents.map((document) => document.id) } },
  data: { deletedAt: new Date() },
});
const deactivatedTemplates = await prisma.documentTemplate.updateMany({
  where: { id: { in: templates.map((template) => template.id) } },
  data: { isActive: false },
});
console.log(`soft-deleted documents: ${deletedDocuments.count}`);
console.log(`deactivated templates: ${deactivatedTemplates.count}`);
await prisma.$disconnect();
