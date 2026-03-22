import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

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

      this.logger.log(`✅ Limpieza de archivos temporales completada: ${deleted} archivos eliminados`);
    } catch (error) {
      this.logger.error(`❌ Error en limpieza de archivos temporales: ${error.message}`);
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

      this.logger.log(`🗑️  Retención configurada: ${retentionDays} días (corte: ${cutoffDate.toISOString().split('T')[0]})`);

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
          // Eliminar archivo físico
          if (this.storage.fileExists(doc.path)) {
            this.storage.deleteFile(doc.path);
            deletedFiles++;
          }

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
            }
          }

          // Eliminar registro de BD (cascada eliminará versiones y accesos)
          await this.prisma.document.delete({
            where: { id: doc.id },
          });

          deletedRecords++;
        } catch (error) {
          this.logger.error(`❌ Error eliminando documento ${doc.id}: ${error.message}`);
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
          path: {
            contains: '/active/',
          },
        },
      });

      let archived = 0;

      for (const doc of documentsToArchive) {
        try {
          // Generar nueva ruta en /archive
          const newPath = doc.path.replace('/active/', '/archive/');

          // Mover archivo
          this.storage.moveFile(doc.path, newPath);

          // Actualizar registro en BD
          await this.prisma.document.update({
            where: { id: doc.id },
            data: { path: newPath },
          });

          archived++;
        } catch (error) {
          this.logger.error(`❌ Error archivando documento ${doc.id}: ${error.message}`);
        }
      }

      this.logger.log(`✅ Archivado completado: ${archived} documentos movidos a archivo`);
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

      this.logger.log(`✅ Limpieza de auditoría completada: ${result.count} registros eliminados`);
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
      const documents = await this.prisma.document.findMany({
        where: {
          checksumSHA256: {
            not: null,
          },
          deletedAt: null,
        },
        take: 100,
        orderBy: {
          updatedAt: 'asc', // Los menos verificados recientemente
        },
      });

      let verified = 0;
      let corrupted = 0;

      for (const doc of documents) {
        try {
          if (!this.storage.fileExists(doc.path)) {
            this.logger.warn(`⚠️  Archivo faltante: ${doc.filename} (ID: ${doc.id})`);
            continue;
          }

          const isValid = await this.storage.verifyFileIntegrity(
            doc.path,
            doc.checksumSHA256,
          );

          if (!isValid) {
            corrupted++;
            this.logger.error(`❌ Archivo corrupto detectado: ${doc.filename} (ID: ${doc.id})`);
            // Aquí podrías enviar alerta por email, Slack, etc.
          } else {
            verified++;
          }
        } catch (error) {
          this.logger.error(`❌ Error verificando documento ${doc.id}: ${error.message}`);
        }
      }

      this.logger.log(
        `✅ Verificación completada: ${verified} OK, ${corrupted} corruptos de ${documents.length} verificados`,
      );
    } catch (error) {
      this.logger.error(`❌ Error en verificación de integridad: ${error.message}`);
    }
  }
}
