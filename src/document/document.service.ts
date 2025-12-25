// src/documents/documents.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { UserRole } from '../auth/role.enum';

const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class DocumentService {
  constructor(private prisma: PrismaService) {}

  async upload(
    file: Express.Multer.File,
    uploadDocumentDto: UploadDocumentDto,
    userId: string,
  ) {
    // Crear registro en BD
    const document = await this.prisma.document.create({
      data: {
        filename: file.originalname,
        storedName: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        description: uploadDocumentDto.description,
        categoryId: uploadDocumentDto.categoryId,
        isPublic: uploadDocumentDto.isPublic || false,
        uploadedById: userId,
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
    const { search, categoryId, isPublic, page = 1, limit = 10 } = query;

    // Construir filtros
    const where: any = {};

    // Si no es admin, solo puede ver sus documentos o públicos
    if (userRole !== UserRole.ADMIN) {
      where.OR = [{ uploadedById: userId }, { isPublic: true }];
    }

    if (search) {
      where.filename = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (isPublic !== undefined) {
      where.isPublic = isPublic;
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

    // Eliminar archivo físico
    try {
      await unlinkAsync(document.path);
    } catch (error) {
      console.error('Error al eliminar archivo físico:', error);
    }

    // Eliminar registro de BD
    await this.prisma.document.delete({
      where: { id },
    });

    return { message: 'Documento eliminado exitosamente' };
  }

  async download(id: number, userId: string, userRole: UserRole) {
    const document = await this.findOne(id, userId, userRole);

    // Verificar que el archivo existe
    if (!fs.existsSync(document.path)) {
      throw new NotFoundException('Archivo no encontrado en el servidor');
    }

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
  ) {
    const document = await this.findOne(id, userId, userRole);

    // Solo el dueño o admin pueden reemplazar
    if (userRole !== UserRole.ADMIN && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para reemplazar este documento',
      );
    }

    // Eliminar archivo antiguo
    try {
      await unlinkAsync(document.path);
    } catch (error) {
      console.error('Error al eliminar archivo antiguo:', error);
    }

    // Actualizar registro con nuevo archivo
    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        filename: file.originalname,
        storedName: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
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

    return updatedDocument;
  }

  async getStats(userId: string, userRole: UserRole) {
    const where: any = {};

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

}
