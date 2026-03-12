import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShareService } from '../share/share.service';
import { BatchUpdateDto } from './dto/batch-update.dto';
import { BatchDeleteDto } from './dto/batch-delete.dto';
import { BatchShareDto } from './dto/batch-share.dto';
import { BatchExportDto } from './dto/batch-export.dto';
import archiver from 'archiver';
import { createReadStream, existsSync } from 'fs';
import { Response } from 'express';
import { join } from 'path';

@Injectable()
export class BatchService {
  constructor(
    private prisma: PrismaService,
    private shareService: ShareService,
  ) {}

  /**
   * Actualización masiva de documentos
   */
  async batchUpdate(batchUpdateDto: BatchUpdateDto, userId: string) {
    const { documentIds, ...updateData } = batchUpdateDto;

    // Verificar que todos los documentos existen y el usuario tiene permisos
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
      },
      select: {
        id: true,
        uploadedById: true,
      },
    });

    if (documents.length !== documentIds.length) {
      throw new NotFoundException('Algunos documentos no fueron encontrados');
    }

    // Verificar permisos
    const unauthorizedDocs = documents.filter((doc) => doc.uploadedById !== userId);
    if (unauthorizedDocs.length > 0) {
      // Verificar si tiene permisos en cada documento
      for (const doc of unauthorizedDocs) {
        const hasPermission = await this.prisma.documentPermission.findFirst({
          where: {
            documentId: doc.id,
            OR: [{ userId }],
            canEdit: true,
          },
        });

        if (!hasPermission) {
          throw new ForbiddenException(`No tienes permiso para editar el documento ${doc.id}`);
        }
      }
    }

    // Realizar la actualización masiva
    const result = await this.prisma.document.updateMany({
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
  }

  /**
   * Eliminación masiva de documentos
   */
  async batchDelete(batchDeleteDto: BatchDeleteDto, userId: string) {
    const { documentIds, permanent } = batchDeleteDto;

    // Verificar que todos los documentos existen y el usuario tiene permisos
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
      },
      select: {
        id: true,
        uploadedById: true,
        path: true,
      },
    });

    if (documents.length !== documentIds.length) {
      throw new NotFoundException('Algunos documentos no fueron encontrados');
    }

    // Verificar permisos
    const unauthorizedDocs = documents.filter((doc) => doc.uploadedById !== userId);
    if (unauthorizedDocs.length > 0) {
      // Verificar si tiene permisos en cada documento
      for (const doc of unauthorizedDocs) {
        const hasPermission = await this.prisma.documentPermission.findFirst({
          where: {
            documentId: doc.id,
            OR: [{ userId }],
            canDelete: true,
          },
        });

        if (!hasPermission) {
          throw new ForbiddenException(`No tienes permiso para eliminar el documento ${doc.id}`);
        }
      }
    }

    if (permanent) {
      // Eliminación permanente
      await this.prisma.document.deleteMany({
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
    } else {
      // Soft delete
      await this.prisma.document.updateMany({
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
    }
  }

  /**
   * Compartir documentos en lote
   */
  async batchShare(batchShareDto: BatchShareDto, userId: string) {
    const { documentIds, ...shareData } = batchShareDto;

    // Verificar que todos los documentos existen
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
      },
      select: {
        id: true,
        uploadedById: true,
      },
    });

    if (documents.length !== documentIds.length) {
      throw new NotFoundException('Algunos documentos no fueron encontrados');
    }

    // Crear shares para cada documento
    const shares = [];
    for (const doc of documents) {
      try {
        const share = await this.shareService.create(
          {
            documentId: doc.id,
            ...shareData,
          },
          userId,
        );
        shares.push(share);
      } catch (error) {
        console.error(`Error al compartir documento ${doc.id}:`, error.message);
      }
    }

    return {
      success: true,
      shared: shares.length,
      documentIds,
      shares,
    };
  }

  /**
   * Exportar documentos en lote a ZIP
   */
  async batchExport(batchExportDto: BatchExportDto, userId: string, res: Response) {
    const { documentIds } = batchExportDto;

    // Verificar que todos los documentos existen y el usuario tiene permisos
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
      },
      select: {
        id: true,
        filename: true,
        path: true,
        uploadedById: true,
      },
    });

    if (documents.length === 0) {
      throw new NotFoundException('No se encontraron documentos para exportar');
    }

    // Verificar permisos
    for (const doc of documents) {
      if (doc.uploadedById !== userId) {
        const hasPermission = await this.prisma.documentPermission.findFirst({
          where: {
            documentId: doc.id,
            OR: [{ userId }],
            canView: true,
          },
        });

        if (!hasPermission) {
          throw new ForbiddenException(`No tienes permiso para ver el documento ${doc.id}`);
        }
      }
    }

    // Crear archivo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Máxima compresión
    });

    // Configurar response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=documents-${Date.now()}.zip`);

    // Pipe del archivo al response
    archive.pipe(res);

    // Agregar archivos al ZIP
    for (const doc of documents) {
      const filePath = join(process.cwd(), doc.path);

      if (existsSync(filePath)) {
        archive.append(createReadStream(filePath), { name: doc.filename });
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
    // Verificar que todos los documentos existen y están eliminados
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
        deletedAt: { not: null },
      },
      select: {
        id: true,
        uploadedById: true,
      },
    });

    if (documents.length === 0) {
      throw new NotFoundException('No se encontraron documentos eliminados para restaurar');
    }

    // Verificar permisos
    const unauthorizedDocs = documents.filter((doc) => doc.uploadedById !== userId);
    if (unauthorizedDocs.length > 0) {
      for (const doc of unauthorizedDocs) {
        const hasPermission = await this.prisma.documentPermission.findFirst({
          where: {
            documentId: doc.id,
            OR: [{ userId }],
            canEdit: true,
          },
        });

        if (!hasPermission) {
          throw new ForbiddenException(`No tienes permiso para restaurar el documento ${doc.id}`);
        }
      }
    }

    // Restaurar documentos
    await this.prisma.document.updateMany({
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
  }
}
