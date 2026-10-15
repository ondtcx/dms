import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { canUnlinkVersionBlob, DAY_MS, getVersionRetention, retentionEvidenceInclude } from '../document/document-version-retention';

@Injectable()
export class CleanupService implements OnModuleInit {
  private readonly logger = new Logger(CleanupService.name);
  private isReady = false;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private settingsService: SettingsService,
  ) {}

  onModuleInit() {
    // Esperar 30s tras el arranque antes de permitir que los crons toquen la BD,
    // para asegurarse de que el pool de Prisma está estabilizado.
    setTimeout(() => {
      this.isReady = true;
    }, 30_000);
  }

  /**
   * Limpia archivos temporales mayores a 1 hora
   * Ejecuta cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanTempFiles() {
    this.logger.log('🧹 Iniciando limpieza de archivos temporales...');

    try {
      const paths = this.storage.getPaths();
      const tempPath = paths.temp;
      const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hora en ms

      const files = readdirSync(tempPath);
      let deleted = 0;

      for (const file of files) {
        const filePath = join(tempPath, file);
        const stats = statSync(filePath);

        if (stats.mtimeMs < oneHourAgo) {
          unlinkSync(filePath);
          deleted++;
        }
      }

      this.logger.log(
        `✅ Limpieza de archivos temporales completada: ${deleted} archivos eliminados`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error en limpieza de archivos temporales: ${error.message}`,
      );
    }
  }

  /**
   * Elimina permanentemente documentos en papelera mayores a 30 días
   * Ejecuta diariamente a las 2 AM
   */
  @Cron('0 2 * * *')
  async cleanTrash() {
    if (!this.isReady) return;
    this.logger.log('🗑️  Iniciando limpieza de papelera...');

    try {
      const retentionDays = await this.settingsService.getTrashRetentionDays();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      this.logger.log(
        `🗑️  Retención configurada: ${retentionDays} días (corte: ${cutoffDate.toISOString().split('T')[0]})`,
      );

      // Buscar documentos eliminados hace más días que el período de retención
      const documentsToDelete = await this.prisma.document.findMany({
        where: {
          deletedAt: {
            lt: cutoffDate,
          },
        },
      });

      let deletedFiles = 0;
      let deletedRecords = 0;

      for (const doc of documentsToDelete) {
        try {


          // Eliminar thumbnail si existe
          const paths = this.storage.getPaths();
          const thumbnailPath = join(paths.thumbnails, `thumb_${doc.id}.jpg`);
          if (existsSync(thumbnailPath)) {
            unlinkSync(thumbnailPath);
          }

          // Eliminar versiones físicas
          const versions = await this.prisma.documentVersion.findMany({
            where: { documentId: doc.id },
          });

          for (const version of versions) {
            if (this.storage.fileExists(version.path)) {
              this.storage.deleteFile(version.path);
              deletedFiles++;
            }
          }

          // Eliminar registro de BD (cascada eliminará versiones y accesos)
          await this.prisma.document.delete({
            where: { id: doc.id },
          });

          deletedRecords++;
        } catch (error) {
          this.logger.error(
            `❌ Error eliminando documento ${doc.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `✅ Limpieza de papelera completada: ${deletedRecords} documentos, ${deletedFiles} archivos eliminados`,
      );
    } catch (error) {
      this.logger.error(`❌ Error en limpieza de papelera: ${error.message}`);
    }
  }

  /**
   * Limpieza acotada de versiones históricas, independiente de la papelera.
   */
  @Cron('30 2 * * *')
  async cleanDocumentVersions(now = new Date()) {
    if (!this.isReady) return;
    try {
      const days = await this.settingsService.getAuthoritativeVersionRetentionDays();
      if (days === null) {
        this.logger.warn('Retención de versiones malformada; se omite la limpieza');
        return;
      }
      const cutoff = new Date(now.getTime() - days * DAY_MS);
      // Filtrar protecciones antes del límite evita que ocupen cada lote diario.
      const candidates = await this.prisma.$queryRaw<Array<{ id: number; documentId: number }>>`
        SELECT v.id, v."documentId"
        FROM "DocumentVersion" v JOIN "Document" d ON d.id = v."documentId"
        WHERE d."deletedAt" IS NULL AND v.version <> d."currentVersion"
          AND v."supersededAt" IS NOT NULL AND v."supersededAt" <= ${cutoff}
          AND v."preservePermanently" = false
          AND (v."preserveUntil" IS NULL OR v."preserveUntil" <= ${now})
          AND (v."retentionGraceUntil" IS NULL OR v."retentionGraceUntil" <= ${now})
          AND v."workflowId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "DocumentWorkflow" w WHERE w."documentVersionId" = v.id)
          AND NOT EXISTS (SELECT 1 FROM "WorkflowApproval" a WHERE a."documentVersionId" = v.id)
          AND NOT EXISTS (SELECT 1 FROM "WorkflowTransition" t WHERE t."documentVersionId" = v.id)
        ORDER BY v."supersededAt" ASC, v.id ASC LIMIT 100
      `;
      for (const candidate of candidates) {
        const deleted = await this.prisma.$transaction(async (tx) => {
          // Orden fijo: política, documento, versión. UPDATE de configuración
          // espera este bloqueo y las extensiones ya confirmadas se respetan.
          const settingsRows = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM "SystemSettings" WHERE id = 1 FOR SHARE`;
          if (settingsRows.length !== 1) {
            // Una fila inexistente no puede serializar una creación concurrente.
            this.logger.warn('Configuración global no bloqueable; se conserva la versión');
            return null;
          }
          const lockedDays = await this.settingsService.getAuthoritativeVersionRetentionDays(tx);
          if (lockedDays === null) {
            this.logger.warn('Retención de versiones malformada bajo bloqueo; se conserva la versión');
            return null;
          }
          await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${candidate.documentId} FOR UPDATE`;
          // Bloquear también la versión impide insertar referencias FK durante la comprobación.
          await tx.$queryRaw`SELECT id FROM "DocumentVersion" WHERE id = ${candidate.id} FOR UPDATE`;
          const document = await tx.document.findUnique({ where: { id: candidate.documentId } });
          const version = await tx.documentVersion.findUnique({
            where: { id: candidate.id }, include: retentionEvidenceInclude,
          });
          if (!document || !version || version.documentId !== candidate.documentId ||
              !getVersionRetention(version, document, lockedDays, now).eligible) return null;
          await tx.documentVersion.delete({ where: { id: version.id } });
          return { id: version.id, path: version.path };
        });
        if (!deleted) continue;
        // Nunca desvincular antes del commit; las referencias se comprueban globalmente.
        try {
          await this.prisma.$transaction(async (tx) => {
            // Bloqueo breve global: ninguna escritura de rutas puede intercalarse
            // entre la comprobación de referencias y la desvinculación física.
            await tx.$executeRaw`LOCK TABLE "DocumentVersion" IN SHARE MODE`;
            // Inventario global acotado, no filtrado por igualdad textual:
            // rutas relativas, enlaces y diferencias de mayúsculas pueden aliasar.
            const references = await tx.documentVersion.findMany({
              select: { path: true }, take: 1001, orderBy: { id: 'asc' },
            });
            if (references.length > 1000 || !canUnlinkVersionBlob(deleted.path, references.map((row) => row.path))) {
              this.logger.warn(`Archivo de versión ${deleted.id} conservado por referencias o identidad incierta; requiere conciliación`);
              return;
            }
            if (this.storage.fileExists(deleted.path)) this.storage.deleteFile(deleted.path);
          });
        } catch {
          // Sin cola persistente: un fallo deja un huérfano para conciliación operativa.
          this.logger.warn(`No se pudo limpiar el archivo de la versión ${deleted.id}; requiere conciliación`);
        }
      }
    } catch (error) {
      this.logger.error('Falló la limpieza de versiones; no se desvinculan archivos sin commit');
      throw error;
    }
  }

  /**
   * Archiva documentos antiguos (> 90 días) moviéndolos a /archive
   * Ejecuta diariamente a las 3 AM
   */
  @Cron('0 3 * * *')
  async archiveOldDocuments() {
    if (!this.isReady) return;
    this.logger.log('📦 Iniciando archivado de documentos antiguos...');

    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // Buscar documentos activos mayores a 90 días
      const documentsToArchive = await this.prisma.document.findMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
          deletedAt: null,
          versions: {
            some: {
              path: {
                contains: '/active/',
              },
            }
          }
        },
        include: { versions: { where: { path: { contains: '/active/' } } } },
      });

      let archived = 0;

      for (const doc of documentsToArchive) {
        try {
          for (const version of doc.versions) {
            // Generar nueva ruta en /archive
            const newPath = version.path.replace('/active/', '/archive/');

            // Mover archivo
            this.storage.moveFile(version.path, newPath);

            // Actualizar registro en BD
            await this.prisma.documentVersion.update({
              where: { id: version.id },
              data: { path: newPath },
            });
          }
          await this.prisma.document.update({
            where: { id: doc.id },
            data: { archivedAt: new Date() },
          });

          archived++;
        } catch (error) {
          this.logger.error(
            `❌ Error archivando documento ${doc.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `✅ Archivado completado: ${archived} documentos movidos a archivo`,
      );
    } catch (error) {
      this.logger.error(`❌ Error en archivado: ${error.message}`);
    }
  }

  /**
   * Limpia registros de auditoría antiguos (> 1 año)
   * Ejecuta mensualmente el día 1 a las 4 AM
   */
  @Cron('0 4 1 * *')
  async cleanOldAuditLogs() {
    if (!this.isReady) return;
    this.logger.log('📋 Iniciando limpieza de logs de auditoría antiguos...');

    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const result = await this.prisma.documentAccess.deleteMany({
        where: {
          createdAt: {
            lt: oneYearAgo,
          },
        },
      });

      this.logger.log(
        `✅ Limpieza de auditoría completada: ${result.count} registros eliminados`,
      );
    } catch (error) {
      this.logger.error(`❌ Error en limpieza de auditoría: ${error.message}`);
    }
  }

  /**
   * Verifica integridad de archivos aleatoriamente
   * Ejecuta semanalmente los domingos a las 5 AM
   */
  @Cron('0 5 * * 0')
  async verifyFileIntegrity() {
    if (!this.isReady) return;
    this.logger.log('🔍 Iniciando verificación de integridad de archivos...');

    try {
      // Seleccionar 100 documentos aleatorios con checksum
      const documents = await this.prisma.documentVersion.findMany({
        where: {
          checksumSHA256: {
            not: null,
          },
          document: { deletedAt: null },
        },
        take: 100,
        orderBy: {
          createdAt: 'asc', // Los menos verificados recientemente
        },
      });

      let verified = 0;
      let corrupted = 0;

      for (const doc of documents) {
        try {
          if (!this.storage.fileExists(doc.path)) {
            this.logger.warn(
              `⚠️  Archivo faltante: ${doc.filename} (ID: ${doc.id})`,
            );
            continue;
          }

          const isValid = await this.storage.verifyFileIntegrity(
            doc.path,
            doc.checksumSHA256,
          );

          if (!isValid) {
            corrupted++;
            this.logger.error(
              `❌ Archivo corrupto detectado: ${doc.filename} (ID: ${doc.id})`,
            );
            // Aquí podrías enviar alerta por email, Slack, etc.
          } else {
            verified++;
          }
        } catch (error) {
          this.logger.error(
            `❌ Error verificando documento ${doc.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `✅ Verificación completada: ${verified} OK, ${corrupted} corruptos de ${documents.length} verificados`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error en verificación de integridad: ${error.message}`,
      );
    }
  }
}
