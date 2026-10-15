/**
 * Rellena el recuento de páginas de las versiones que todavía no lo tienen.
 *
 * Uso:
 *   npx ts-node scripts/backfill-page-count.ts [--limit=<n>] [--dry-run]
 *
 * Usa el mismo servicio que el backend, así que los formatos de Office se
 * cuentan con su conversión real de vista previa. Cada versión es independiente:
 * un archivo ilegible se queda sin recuento y el proceso continúa.
 */

import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentPageCountService } from '../src/document/document-page-count.service';
import { OfficeContentModule } from '../src/document/office-content/office-content.module';
import { canReadPageCountDirectly } from '../src/document/page-count';
import {
  OFFICE_PREVIEW_MIMES,
  supportsOfficePreview,
} from '../src/document/office-content/office-mimetypes';

const PDF_MIME = 'application/pdf';
const IMAGE_MIME_PREFIX = 'image/';
const BATCH_SIZE = 25;

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), OfficeContentModule],
  providers: [PrismaService, DocumentPageCountService],
})
class PageCountBackfillModule {}

const measurable = (mimetype: string) =>
  canReadPageCountDirectly(mimetype) || supportsOfficePreview(mimetype);

function readPositiveLimit(): number | null {
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith('--limit='));
  if (!argument) return null;
  const limit = Number(argument.slice('--limit='.length));
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('--limit debe ser un entero positivo');
  }
  return limit;
}

async function main() {
  const logger = new Logger('BackfillPageCount');
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const limit = readPositiveLimit();

  const app = await NestFactory.createApplicationContext(
    PageCountBackfillModule,
    { logger: ['error', 'warn', 'log'] },
  );

  try {
    const prisma = app.get(PrismaService);
    const pageCounts = app.get(DocumentPageCountService);

    // Los formatos no medibles se descartan en memoria: el filtro de la consulta
    // solo acota el conjunto para no recorrer toda la tabla.
    const where = {
      pageCount: null,
      OR: [
        { mimetype: PDF_MIME },
        { mimetype: { startsWith: IMAGE_MIME_PREFIX } },
        { mimetype: { in: OFFICE_PREVIEW_MIMES } },
      ],
    };

    const pending = await prisma.documentVersion.count({ where });
    if (dryRun) {
      logger.log(`Versiones sin recuento (posibles candidatas): ${pending}`);
      return;
    }

    let processed = 0;
    let counted = 0;
    let skipped = 0;
    let cursor: number | undefined;

    for (;;) {
      const batch = await prisma.documentVersion.findMany({
        where,
        select: { id: true, path: true, mimetype: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor === undefined ? {} : { skip: 1, cursor: { id: cursor } }),
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const version of batch) {
        if (limit !== null && processed >= limit) break;
        if (!measurable(version.mimetype)) {
          skipped++;
          continue;
        }
        processed++;
        const stored = await pageCounts.record(version);
        if (stored === null) {
          logger.warn(
            `Sin recuento para la versión ${version.id} (${version.mimetype})`,
          );
        } else {
          counted++;
        }
      }

      if (batch.length < BATCH_SIZE) break;
      if (limit !== null && processed >= limit) break;
    }

    logger.log(
      `Procesadas: ${processed}; con recuento: ${counted}; omitidas por formato: ${skipped}; sin recuento pendientes al inicio: ${pending}`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  new Logger('BackfillPageCount').error(
    `Backfill interrumpido: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
