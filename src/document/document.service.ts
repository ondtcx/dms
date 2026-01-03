// src/documents/documents.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import * as fs from 'fs';
import { extname } from 'path';
import { promisify } from 'util';
import { UserRole } from '../auth/role.enum';
import { v4 as uuidv4 } from 'uuid';

const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async upload(
    file: Express.Multer.File,
    uploadDocumentDto: UploadDocumentDto,
    userId: string,
  ) {
    // 1. Generar nombre único y ruta estructurada
    const uniqueFilename = `${uuidv4()}${extname(file.originalname)}`;
    const storageLocation = this.storage.generateStructuredPath(
      userId,
      uploadDocumentDto.categoryId,
      uniqueFilename,
    );

    // 2. Mover archivo de /temp a ubicación estructurada
    this.storage.moveFile(file.path, storageLocation.path);

    // 3. Calcular checksum del archivo
    const checksum = await this.storage.calculateFileHash(storageLocation.path);

    // 4. Crear registro en BD
    const document = await this.prisma.document.create({
      data: {
        filename: file.originalname,
        storedName: uniqueFilename,
        mimetype: file.mimetype,
        size: file.size,
        path: storageLocation.path,
        description: uploadDocumentDto.description,
        categoryId: uploadDocumentDto.categoryId,
        isPublic: uploadDocumentDto.isPublic || false,
        uploadedById: userId,
        checksumSHA256: checksum,
        currentVersion: 1,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    // 5. Crear versión inicial
    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storedName: uniqueFilename,
        path: storageLocation.path,
        size: file.size,
        checksumSHA256: checksum,
        comment: 'Versión inicial',
        createdById: userId,
      },
    });

    return document;
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    uploadDocumentDto: UploadDocumentDto,
    userId: string,
  ) {
    const uploadedDocuments = await Promise.all(
      files.map((file) => this.upload(file, uploadDocumentDto, userId)),
    );

    return uploadedDocuments;
  }

  async findAll(query: QueryDocumentDto, userId: number, userRole: UserRole) {
    const { search, categoryId, isPublic, includeDeleted, page = 1, limit = 10 } = query;

    // Construir filtros
    const where: any = {
      AND: [],
    };

    // IMPORTANTE: Filtrar documentos eliminados (soft delete)
    // Solo excluir si includeDeleted es false o undefined
    if (!includeDeleted) {
      where.AND.push({ deletedAt: null });
    }

    // Si no es admin, solo puede ver sus documentos o públicos
    if (userRole !== UserRole.ADMIN) {
      where.AND.push({
        OR: [{ uploadedById: userId }, { isPublic: true }],
      });
    }

    // Búsqueda en nombre y descripción
    if (search) {
      where.AND.push({
        OR: [
          {
            filename: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (categoryId) {
      where.AND.push({ categoryId });
    }

    if (isPublic !== undefined) {
      where.AND.push({ isPublic });
    }

    // Si no hay condiciones AND, usar objeto vacío
    if (where.AND.length === 0) {
      delete where.AND;
    }

    // Paginación
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data: documents,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, userId: string, userRole: UserRole) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Verificar permisos
    if (
      userRole !== UserRole.ADMIN &&
      document.uploadedById !== userId &&
      !document.isPublic
    ) {
      throw new ForbiddenException('No tienes permiso para ver este documento');
    }

    return document;
  }

  async update(
    id: number,
    updateDocumentDto: UpdateDocumentDto,
    userId: string,
    userRole: UserRole,
  ) {
    const document = await this.findOne(id, userId, userRole);

    // Solo el dueño o admin pueden actualizar
    if (userRole !== UserRole.ADMIN && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar este documento',
      );
    }

    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: updateDocumentDto,
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    return updatedDocument;
  }

  async remove(id: number, userId: string, userRole: UserRole) {
    const document = await this.findOne(id, userId, userRole);

    // Solo el dueño o admin pueden eliminar
    if (userRole !== UserRole.ADMIN && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este documento',
      );
    }

    // SOFT DELETE: Mover archivo a papelera
    const trashPath = this.storage.moveToTrash(
      document.path,
      document.id,
      document.storedName,
    );

    // Actualizar registro en BD (soft delete)
    await this.prisma.document.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
        path: trashPath, // Actualizar path a la ubicación en trash
      },
    });

    // Registrar auditoría
    await this.prisma.documentAccess.create({
      data: {
        documentId: id,
        userId: userId,
        action: 'DELETE',
      },
    });

    return { message: 'Documento movido a papelera exitosamente' };
  }

  /**
   * Restaurar documento desde la papelera
   */
  async restore(id: number, userId: string, userRole: UserRole) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (!document.deletedAt) {
      throw new BadRequestException('El documento no está eliminado');
    }

    // Solo el dueño o admin pueden restaurar
    if (userRole !== UserRole.ADMIN && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para restaurar este documento',
      );
    }

    // Generar nueva ruta estructurada
    const storageLocation = this.storage.generateStructuredPath(
      document.uploadedById,
      document.categoryId,
      document.storedName,
    );

    // Restaurar archivo desde trash
    this.storage.restoreFromTrash(document.path, storageLocation.path);

    // Actualizar BD
    await this.prisma.document.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
        path: storageLocation.path,
      },
    });

    return { message: 'Documento restaurado exitosamente' };
  }

  /**
   * Eliminar permanentemente un documento
   */
  async permanentDelete(id: number, userId: string, userRole: UserRole) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Solo admin puede eliminar permanentemente
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo administradores pueden eliminar permanentemente documentos',
      );
    }

    // Eliminar archivo físico
    this.storage.deleteFile(document.path);

    // Eliminar todas las versiones físicas
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
    });

    for (const version of versions) {
      this.storage.deleteFile(version.path);
    }

    // Eliminar registro de BD (esto eliminará en cascada versiones y accesos)
    await this.prisma.document.delete({
      where: { id },
    });

    return { message: 'Documento eliminado permanentemente' };
  }

  async download(id: number, userId: string, userRole: UserRole) {
    const document = await this.findOne(id, userId, userRole);

    // Verificar que el archivo existe
    if (!this.storage.fileExists(document.path)) {
      throw new NotFoundException('Archivo no encontrado en el servidor');
    }

    // Verificar integridad del archivo si hay checksum
    if (document.checksumSHA256) {
      const isValid = await this.storage.verifyFileIntegrity(
        document.path,
        document.checksumSHA256,
      );
      if (!isValid) {
        throw new BadRequestException(
          'El archivo está corrupto o ha sido modificado',
        );
      }
    }

    // Registrar auditoría de descarga
    await this.prisma.documentAccess.create({
      data: {
        documentId: id,
        userId: userId,
        action: 'DOWNLOAD',
      },
    });

    return {
      path: document.path,
      filename: document.filename,
      mimetype: document.mimetype,
    };
  }

  async replaceFile(
    id: number,
    file: Express.Multer.File,
    userId: string,
    userRole: UserRole,
    comment?: string,
  ) {
    const document = await this.findOne(id, userId, userRole);

    // Solo el dueño o admin pueden reemplazar
    if (userRole !== UserRole.ADMIN && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para reemplazar este documento',
      );
    }

    // 1. Copiar versión actual a carpeta de versiones
    const currentDate = new Date(document.createdAt);
    const versionFilename = `${document.storedName.split('.')[0]}_v${document.currentVersion}${extname(document.storedName)}`;
    const versionLocation = this.storage.generateVersionPath(
      document.uploadedById,
      versionFilename,
      currentDate,
    );

    // Copiar archivo actual a versiones (no mover, copiar)
    this.storage.copyFile(document.path, versionLocation.path);

    // 2. Generar nueva versión
    const newVersion = document.currentVersion + 1;
    const newFilename = `${uuidv4()}${extname(file.originalname)}`;
    const newStorageLocation = this.storage.generateStructuredPath(
      document.uploadedById,
      document.categoryId,
      newFilename,
    );

    // 3. Mover nuevo archivo de temp a ubicación estructurada
    this.storage.moveFile(file.path, newStorageLocation.path);

    // 4. Calcular checksum del nuevo archivo
    const newChecksum = await this.storage.calculateFileHash(
      newStorageLocation.path,
    );

    // 5. Eliminar versión antigua (ya está copiada en versiones)
    this.storage.deleteFile(document.path);

    // 6. Actualizar documento en BD
    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        filename: file.originalname,
        storedName: newFilename,
        mimetype: file.mimetype,
        size: file.size,
        path: newStorageLocation.path,
        checksumSHA256: newChecksum,
        currentVersion: newVersion,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    // 7. Crear registro de nueva versión
    await this.prisma.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        storedName: newFilename,
        path: newStorageLocation.path,
        size: file.size,
        checksumSHA256: newChecksum,
        comment: comment || `Versión ${newVersion}`,
        createdById: userId,
      },
    });

    // 8. Registrar auditoría
    await this.prisma.documentAccess.create({
      data: {
        documentId: id,
        userId: userId,
        action: 'UPDATE',
      },
    });

    return updatedDocument;
  }

  /**
   * Obtener todas las versiones de un documento
   */
  async getVersions(id: number, userId: string, userRole: UserRole) {
    const document = await this.findOne(id, userId, userRole);

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        version: 'desc',
      },
    });

    return versions;
  }

  /**
   * Restaurar una versión anterior de un documento
   */
  async restoreVersion(
    documentId: number,
    versionNumber: number,
    userId: string,
    userRole: UserRole,
  ) {
    const document = await this.findOne(documentId, userId, userRole);

    // Solo el dueño o admin pueden restaurar versiones
    if (userRole !== UserRole.ADMIN && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para restaurar versiones de este documento',
      );
    }

    // Buscar la versión solicitada
    const version = await this.prisma.documentVersion.findUnique({
      where: {
        documentId_version: {
          documentId,
          version: versionNumber,
        },
      },
    });

    if (!version) {
      throw new NotFoundException('Versión no encontrada');
    }

    // Verificar que el archivo de la versión existe
    if (!this.storage.fileExists(version.path)) {
      throw new NotFoundException(
        'Archivo de la versión no encontrado en el servidor',
      );
    }

    // 1. Guardar versión actual antes de restaurar
    const currentVersion = document.currentVersion + 1;
    const currentVersionFilename = `${document.storedName.split('.')[0]}_v${document.currentVersion}${extname(document.storedName)}`;
    const currentVersionLocation = this.storage.generateVersionPath(
      document.uploadedById,
      currentVersionFilename,
      new Date(document.createdAt),
    );

    this.storage.copyFile(document.path, currentVersionLocation.path);

    // 2. Copiar archivo de la versión solicitada a ubicación principal
    const newFilename = `${uuidv4()}${extname(version.storedName)}`;
    const newLocation = this.storage.generateStructuredPath(
      document.uploadedById,
      document.categoryId,
      newFilename,
    );

    this.storage.copyFile(version.path, newLocation.path);

    // 3. Eliminar archivo actual
    this.storage.deleteFile(document.path);

    // 4. Actualizar documento en BD
    const updatedDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        storedName: newFilename,
        path: newLocation.path,
        size: version.size,
        checksumSHA256: version.checksumSHA256,
        currentVersion,
      },
    });

    // 5. Crear registro de versión restaurada
    await this.prisma.documentVersion.create({
      data: {
        documentId,
        version: currentVersion,
        storedName: newFilename,
        path: newLocation.path,
        size: version.size,
        checksumSHA256: version.checksumSHA256,
        comment: `Restaurada desde versión ${versionNumber}`,
        createdById: userId,
      },
    });

    return updatedDocument;
  }

  async getStats(userId: string, userRole: UserRole) {
    const where: any = { deletedAt: null }; // Excluir eliminados

    if (userRole !== UserRole.ADMIN) {
      where.uploadedById = userId;
    }

    const [totalDocuments, totalSize] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.aggregate({
        where,
        _sum: {
          size: true,
        },
      }),
    ]);

    return {
      totalDocuments,
      totalSize: totalSize._sum.size || 0,
      totalSizeMB: ((totalSize._sum.size || 0) / (1024 * 1024)).toFixed(2),
    };
  }

  async getCategories(userId: string, userRole: UserRole) {
    const where: any = { deletedAt: null }; // Excluir eliminados

    if (userRole !== UserRole.ADMIN) {
      where.OR = [{ uploadedById: userId }, { isPublic: true }];
    }

    const categories = await this.prisma.document.groupBy({
      by: ['categoryId'],
      where: {
        ...where,
        categoryId: {
          not: null,
        },
      },
      _count: {
        categoryId: true,
      },
      orderBy: {
        _count: {
          categoryId: 'desc',
        },
      },
    });

    return categories.map((cat) => ({
      category: cat.categoryId,
      count: cat._count.categoryId,
    }));
  }

}
