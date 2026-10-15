import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../auth/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { DirectoryService } from '../directory/directory.service';
import { assertWorkflowEditable } from '../document/document-workflow-edit.policy';
import { BatchUpdateDto } from './dto/batch-update.dto';
import { BatchDeleteDto } from './dto/batch-delete.dto';
import { BatchExportDto } from './dto/batch-export.dto';
import archiver from 'archiver';
import { createReadStream, existsSync } from 'fs';
import { Response } from 'express';
import { join } from 'path';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    private prisma: PrismaService,
    private readonly directory: DirectoryService,
  ) {}

  // Bloquea en orden estable todas las filas objetivo dentro de la transacción
  // Serializable; sin este bloqueo previo los guardianes de recepción podrían
  // leer estado obsoleto. Una lista vacía no genera SQL inválido.
  private async lockDocuments(db: Prisma.TransactionClient, documentIds: number[]) {
    const ids = [...new Set(documentIds)].sort((a, b) => a - b);
    if (!ids.length) return;
    await db.$queryRaw(
      Prisma.sql`SELECT id FROM "Document" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
    );
  }

  // Toda mutación en lote comparte comprobación y escritura en una única
  // transacción; un conflicto de serialización exige repetir la petición.
  private async bulkTransaction<T>(
    operation: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034') {
        throw new ConflictException('El lote cambió durante la operación. Vuelve a intentarlo');
      }
      throw error;
    }
  }

  /**
   * Actualización masiva de documentos
   */
  async batchUpdate(batchUpdateDto: BatchUpdateDto, userId: string) {
    const { documentIds, ...updateData } = batchUpdateDto;

    return this.bulkTransaction(async (db) => {
      await this.lockDocuments(db, documentIds);

      // Verificar que todos los documentos existen y el usuario tiene permisos
      const documents = await db.document.findMany({
        where: {
          id: { in: documentIds },
        },
        select: {
          id: true,
          uploadedById: true,
          directoryId: true,
          receptionOriginDirectoryId: true,
        },
      });

      if (documents.length !== documentIds.length) {
        throw new NotFoundException('Algunos documentos no fueron encontrados');
      }

      // Verificar permisos ordinarios previos sin alterar su semántica
      const unauthorizedDocs = documents.filter(
        (doc) => doc.uploadedById !== userId,
      );
      if (unauthorizedDocs.length > 0) {
        // Verificar si tiene permisos en cada documento
        for (const doc of unauthorizedDocs) {
          const hasPermission = await db.documentPermission.findFirst({
            where: {
              documentId: doc.id,
              OR: [{ userId }],
              canEdit: true,
            },
          });

          if (!hasPermission) {
            throw new ForbiddenException(
              `No tienes permiso para editar el documento ${doc.id}`,
            );
          }
        }
      }

      // Guardián de recepción: solo el autor con participación viva. Los
      // documentos ordinarios no se ven afectados por este candado. Para los
      // documentos de recepción se aplica además la misma regla de edición con
      // workflow activo que usa la actualización individual, con rol USER
      // neutro para impedir el bypass global de ADMIN.
      for (const doc of documents) {
        const reception = await this.directory.assertDocumentMutation(db, doc, userId, 'edit');
        if (reception) {
          await assertWorkflowEditable(db, doc.id, userId, UserRole.USER);
        }
      }

      // Realizar la actualización masiva
      const result = await db.document.updateMany({
        where: {
          id: { in: documentIds },
        },
        data: updateData,
      });

      return {
        success: true,
        updated: result.count,
        documentIds,
      };
    });
  }

  /**
   * Eliminación masiva de documentos
   */
  async batchDelete(batchDeleteDto: BatchDeleteDto, userId: string) {
    const { documentIds, permanent } = batchDeleteDto;

    return this.bulkTransaction(async (db) => {
      await this.lockDocuments(db, documentIds);

      // Verificar que todos los documentos existen y el usuario tiene permisos
      const documents = await db.document.findMany({
        where: {
          id: { in: documentIds },
        },
        select: {
          id: true,
          uploadedById: true,
          directoryId: true,
          receptionOriginDirectoryId: true,
        },
      });

      if (documents.length !== documentIds.length) {
        throw new NotFoundException('Algunos documentos no fueron encontrados');
      }

      // Verificar permisos ordinarios previos sin alterar su semántica
      const unauthorizedDocs = documents.filter(
        (doc) => doc.uploadedById !== userId,
      );
      if (unauthorizedDocs.length > 0) {
        // Verificar si tiene permisos en cada documento
        for (const doc of unauthorizedDocs) {
          const hasPermission = await db.documentPermission.findFirst({
            where: {
              documentId: doc.id,
              OR: [{ userId }],
              canDelete: true,
            },
          });

          if (!hasPermission) {
            throw new ForbiddenException(
              `No tienes permiso para eliminar el documento ${doc.id}`,
            );
          }
        }
      }

      if (permanent) {
        // Rechazo íntegro: cualquier objetivo con origen o carpeta de recepción
        // vigente impide la eliminación permanente, sin importar rol ni permisos.
        for (const doc of documents) {
          const scope = await this.directory.resolveDocumentReceptionScope(
            db,
            doc,
            userId,
          );
          if (scope.reception) {
            throw new ForbiddenException(
              'No se puede eliminar permanentemente un documento de recepción en lote',
            );
          }
        }

        // Eliminación permanente
        await db.document.deleteMany({
          where: {
            id: { in: documentIds },
          },
        });

        return {
          success: true,
          deleted: documents.length,
          permanent: true,
          documentIds,
        };
      }

      // La papelera es una retirada: solo el autor vivo y sin revisión activa.
      for (const doc of documents) {
        await this.directory.assertDocumentMutation(db, doc, userId, 'withdraw');
      }

      // Soft delete
      await db.document.updateMany({
        where: {
          id: { in: documentIds },
        },
        data: {
          deletedAt: new Date(),
          deletedById: userId,
        },
      });

      return {
        success: true,
        deleted: documents.length,
        permanent: false,
        documentIds,
      };
    });
  }

  /**
   * Exportar documentos en lote a ZIP
   */
  async batchExport(
    batchExportDto: BatchExportDto,
    userId: string,
    res: Response,
  ) {
    const { documentIds } = batchExportDto;

    // Verificar que todos los documentos existen y el usuario tiene permisos
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
      },
      select: {
        id: true,
        versions: { select: { filename: true, path: true }, take: 1 },
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
      },
    });

    if (documents.length === 0) {
      throw new NotFoundException('No se encontraron documentos para exportar');
    }

    // Verificar permisos antes de crear cualquier cabecera o stream. Los
    // documentos de recepción usan el guardián canónico de lectura (revisores y
    // pares vivos según la política vigente) en lugar de exigir concesiones
    // ordinarias irrelevantes; los documentos ordinarios mantienen su contrato.
    const readDb = this.prisma as unknown as Prisma.TransactionClient;
    for (const doc of documents) {
      const scope = await this.directory.resolveDocumentReceptionScope(
        readDb,
        doc,
        userId,
      );
      if (scope.reception) {
        await this.directory.assertReceptionRead(readDb, doc.id, scope);
        continue;
      }
      if (doc.uploadedById !== userId) {
        const hasPermission = await this.prisma.documentPermission.findFirst({
          where: {
            documentId: doc.id,
            OR: [{ userId }],
            canView: true,
          },
        });

        if (!hasPermission) {
          throw new ForbiddenException(
            `No tienes permiso para ver el documento ${doc.id}`,
          );
        }
      }
    }

    // Crear archivo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Máxima compresión
    });

    // Configurar response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=documents-${Date.now()}.zip`,
    );

    // Pipe del archivo al response
    archive.pipe(res);

    // Agregar archivos al ZIP
    for (const doc of documents) {
      const filePath = join(process.cwd(), doc.versions[0].path);

      if (existsSync(filePath)) {
        archive.append(createReadStream(filePath), { name: doc.versions[0].filename });
      } else {
        console.warn(`Archivo no encontrado: ${filePath}`);
      }
    }

    // Finalizar el archivo
    await archive.finalize();

    return {
      success: true,
      exported: documents.length,
      documentIds,
    };
  }

  /**
   * Restaurar documentos eliminados (soft delete) en lote
   */
  async batchRestore(documentIds: number[], userId: string) {
    return this.bulkTransaction(async (db) => {
      await this.lockDocuments(db, documentIds);

      // Verificar que todos los documentos existen y están eliminados
      const documents = await db.document.findMany({
        where: {
          id: { in: documentIds },
          deletedAt: { not: null },
        },
        select: {
          id: true,
          uploadedById: true,
          directoryId: true,
          receptionOriginDirectoryId: true,
        },
      });

      if (documents.length === 0) {
        throw new NotFoundException(
          'No se encontraron documentos eliminados para restaurar',
        );
      }

      // Verificar permisos ordinarios previos sin alterar su semántica
      const unauthorizedDocs = documents.filter(
        (doc) => doc.uploadedById !== userId,
      );
      if (unauthorizedDocs.length > 0) {
        for (const doc of unauthorizedDocs) {
          const hasPermission = await db.documentPermission.findFirst({
            where: {
              documentId: doc.id,
              OR: [{ userId }],
              canEdit: true,
            },
          });

          if (!hasPermission) {
            throw new ForbiddenException(
              `No tienes permiso para restaurar el documento ${doc.id}`,
            );
          }
        }
      }

      // La restauración actualiza TODOS los IDs solicitados, no solo los
      // eliminados; todo objetivo de recepción debe ser un autor vivo y sin
      // revisión activa antes de escribir, incluso en una entrada mixta.
      const targets = await db.document.findMany({
        where: {
          id: { in: documentIds },
        },
        select: {
          id: true,
          uploadedById: true,
          directoryId: true,
          receptionOriginDirectoryId: true,
        },
      });
      for (const doc of targets) {
        await this.directory.assertDocumentMutation(db, doc, userId, 'withdraw');
      }

      // Restaurar documentos
      await db.document.updateMany({
        where: {
          id: { in: documentIds },
        },
        data: {
          deletedAt: null,
          deletedById: null,
        },
      });

      return {
        success: true,
        restored: documents.length,
        documentIds,
      };
    });
  }

  // ============ Gestión de lotes de documentos ============

  async listBatches(
    userId: string,
    userRole: UserRole,
    page: number | string = 1,
    limit: number | string = 20,
  ) {
    const pageNum = parseInt(String(page), 10) || 1;
    const limitNum = parseInt(String(limit), 10) || 20;
    const where = userRole === UserRole.ADMIN ? {} : { createdById: userId };
    const skip = (pageNum - 1) * limitNum;

    const [batches, total] = await Promise.all([
      this.prisma.documentBatch.findMany({
        where,
        include: {
          template: {
            select: {
              id: true,
              name: true,
              documentType: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { documentTemplateData: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.documentBatch.count({ where }),
    ]);

    return {
      data: batches,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getBatch(id: string, userId: string, userRole: UserRole) {
    const batch = await this.prisma.documentBatch.findUnique({
      where: { id },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            documentType: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
        documentTemplateData: {
          select: {
            document: {
              include: {
                versions: { select: { filename: true }, take: 1 },
                uploadedBy: { select: { id: true, name: true, email: true } },
                category: {
                  select: {
                    id: true,
                    name: true,
                    color: true,
                    icon: true,
                  },
                },
              }
            }
          }
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote no encontrado');
    }

    if (userRole !== UserRole.ADMIN && batch.createdById !== userId) {
      throw new ForbiddenException('No tienes permiso para ver este lote');
    }

    return batch;
  }

  async deleteBatch(id: string, userId: string, userRole: UserRole) {
    const batch = await this.getBatch(id, userId, userRole);

    const docsCount = await this.prisma.document.count({
      where: { templateData: { batchId: id }, deletedAt: null },
    });

    const docsToUpdate = await this.prisma.document.findMany({
      where: { templateData: { batchId: id }, deletedAt: null },
      select: { id: true }
    });

    // Soft-delete todos los documentos del lote
    await this.prisma.document.updateMany({
      where: { id: { in: docsToUpdate.map(d => d.id) } },
      data: { deletedAt: new Date(), deletedById: userId },
    });

    // Eliminar el registro del lote
    await this.prisma.documentBatch.delete({ where: { id } });

    this.logger.log(
      `Batch ${id} deleted by user ${userId}. ${docsCount} documents soft-deleted.`,
    );

    return { success: true, deletedDocuments: docsCount };
  }

  async exportBatch(
    id: string,
    userId: string,
    userRole: UserRole,
    res: Response,
  ) {
    const batch = await this.getBatch(id, userId, userRole);

    const batchName = batch.name
      .replace(/[^a-zA-Z0-9\-_\s]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lote-${batchName}-${Date.now()}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const batchDocuments = await this.prisma.document.findMany({
      where: { templateData: { batchId: id }, deletedAt: null },
      select: { id: true, versions: { select: { filename: true, path: true }, take: 1 } },
    });

    for (const doc of batchDocuments) {
      const filePath = join(
        process.cwd(),
        doc.versions[0].path.startsWith('/') ? doc.versions[0].path.slice(1) : doc.versions[0].path,
      );
      if (existsSync(filePath)) {
        archive.append(createReadStream(filePath), { name: doc.versions[0].filename });
      } else {
        this.logger.warn(`File not found for document ${doc.id}: ${filePath}`);
      }
    }

    await archive.finalize();
  }
}
