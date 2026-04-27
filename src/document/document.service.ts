// src/documents/documents.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import * as fs from 'fs';
import { extname } from 'path';
import { promisify } from 'util';

import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { randomUUID } from 'crypto';
import { SettingsService } from '../settings/settings.service';
import { DocumentNumberingService } from './document-numbering.service';

const pdfParse = require('pdf-parse');

const unlinkAsync = promisify(fs.unlink);
const readFileAsync = promisify(fs.readFile);

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private settingsService: SettingsService,
    private thumbnailService: ThumbnailService,
    private numberingService: DocumentNumberingService,
  ) {}

  async upload(
    file: Express.Multer.File | undefined,
    uploadDocumentDto: UploadDocumentDto,
    userId: string,
  ) {
    // 0. Validar acceso a la categoría (CategoryRole + requiresCourse)
    if (uploadDocumentDto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: uploadDocumentDto.categoryId },
        select: {
          requiresCourse: true,
          categoryRoles: {
            select: {
              roleId: true,
            },
          },
        },
      });
      if (category) {
        const allowedRoleIds = category.categoryRoles.map((categoryRole) => categoryRole.roleId);
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        const isAdmin = user?.role?.name === 'admin';
        if (
          !isAdmin &&
          allowedRoleIds.length > 0 &&
          user &&
          !allowedRoleIds.includes(user.role?.id ?? '')
        ) {
          throw new ForbiddenException(
            'Tu rol no tiene permiso para subir documentos a esta categoría',
          );
        }
        if (category.requiresCourse && !uploadDocumentDto.academic?.courseId) {
          throw new BadRequestException(
            'Esta categoría requiere especificar un curso',
          );
        }
      }
    }

    // 1. Resolver año lectivo: usar el especificado o asignar el año isCurrent automáticamente
    let resolvedAcademicYearId: number | null =
      uploadDocumentDto.academic?.academicYearId ?? null;
    if (resolvedAcademicYearId === null) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true, isActive: true },
        select: { id: true },
      });
      resolvedAcademicYearId = currentYear?.id ?? null;
    }

    // 2. Generar nombre único y ruta estructurada solo si existe archivo adjunto
    const uniqueFilename = file
      ? `${randomUUID()}${extname(file.originalname)}`
      : null;
    const storageLocation = file && uniqueFilename
      ? this.storage.generateStructuredPath(
          userId,
          uploadDocumentDto.categoryId,
          uniqueFilename,
        )
      : null;

    if (file && storageLocation) {
      this.storage.moveFile(file.path, storageLocation.path);
    }

    // 3. Calcular checksum del archivo
    const checksum = storageLocation
      ? await this.storage.calculateFileHash(storageLocation.path)
      : null;

    // 4. Extraer texto de PDF si es un PDF
    let extractedText: string | null = null;
    if (file?.mimetype === 'application/pdf' && storageLocation) {
      extractedText = await this.extractTextFromPDF(storageLocation.path);
    }

    // 5. Crear registro en BD
    const academicData = uploadDocumentDto.academic || {};
    const hasAcademic = academicData.courseId || academicData.subjectId || resolvedAcademicYearId;
    const templateData = uploadDocumentDto.templateData;
    const searchData = uploadDocumentDto.search || {};
    const hasSearch = searchData.extractedText || extractedText;

    const document = await this.prisma.document.create({
      data: {
        title:
          uploadDocumentDto.title?.trim() ||
          file?.originalname ||
          'Documento físico sin archivo adjunto',
        description: uploadDocumentDto.description,
        documentDate: uploadDocumentDto.documentDate
          ? new Date(uploadDocumentDto.documentDate)
          : undefined,
        sender: uploadDocumentDto.sender,
        recipient: uploadDocumentDto.recipient,
        keywords: uploadDocumentDto.keywords,
        status: uploadDocumentDto.status || 'REGISTRADO',
        physicalBuilding: uploadDocumentDto.physicalBuilding,
        physicalOffice: uploadDocumentDto.physicalOffice,
        physicalArchive: uploadDocumentDto.physicalArchive,
        physicalBox: uploadDocumentDto.physicalBox,
        physicalNotes: uploadDocumentDto.physicalNotes,
        categoryId: uploadDocumentDto.categoryId,
        documentTypeId: uploadDocumentDto.documentTypeId,
        isPublic: uploadDocumentDto.isPublic || false,
        uploadedById: userId,
        checksumSHA256: checksum,
        currentVersion: file ? 1 : 0,

        ...(hasAcademic ? {
          academic: {
            create: {
              courseId: academicData.courseId,
              subjectId: academicData.subjectId,
              academicYearId: resolvedAcademicYearId,
            }
          }
        } : {}),

        ...(templateData ? {
          templateData: {
            create: {
              templateId: templateData.templateId,
              formData: templateData.formData,
              batchId: templateData.batchId,
            }
          }
        } : {}),

        ...(hasSearch ? {
          search: {
            create: {
              extractedText: extractedText || searchData.extractedText,
            }
          }
        } : {}),

        ...(file && storageLocation && uniqueFilename
          ? {
              versions: {
                create: [{
                  version: 1,
                  filename: file.originalname,
                  mimetype: file.mimetype,
                  storedName: uniqueFilename,
                  path: storageLocation.path,
                  size: file.size,
                  checksumSHA256: checksum,
                  comment: 'Versión inicial',
                  createdById: userId,
                  source: 'UPLOAD_INICIAL',
                }],
              },
            }
          : {}),
      },
      include: {
        academic: true,
        search: true,
        templateData: true,
        versions: { orderBy: { version: 'desc' }, take: 1 },
        uploadedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            section: {
              select: { id: true, name: true, color: true, icon: true },
            },
          },
        },
        documentType: {
          select: { id: true, name: true },
        },
        
      },
    });

    // 7. Regenerar thumbnail en background para garantizar que corresponde al archivo actual
    if (storageLocation && file) {
      this.thumbnailService
        .regenerateThumbnail(storageLocation.path, document.id, file.mimetype)
        .catch(() => {});
    }

    // 8. Asignar número institucional en background (no bloquea la respuesta)
    this.numberingService
      .assignNumber(document.id, uploadDocumentDto.categoryId)
      .catch(() => {});

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

  async findAll(query: QueryDocumentDto, userId: string, userRole: string) {
    const {
      search,
      status,
      modality,
      dateFrom,
      dateTo,
      categoryId,
      documentTypeId,
      sectionId,
      isPublic,
      includeDeleted,
      onlyMine,
      excludeBatched,
      batchId,
      page = 1,
      limit = 10,
      excludeComposites,
    } = query;

    // Cargar usuario con departmentId para el filtro de acceso
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role?.name as unknown as string,
        })
      : null;

    // Construir filtros
    const where: any = {
      AND: [],
    };

    // Filtrar documentos eliminados (soft delete)
    if (!includeDeleted) {
      where.AND.push({ deletedAt: null });
    }

    // Filtro de acceso basado en relaciones (ReBAC)
    if (accessFilter) {
      where.AND.push(accessFilter);
    }

    // Búsqueda en nombre y descripción
    if (search) {
      where.AND.push({
        OR: [
          {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            versions: { some: { filename: { contains: search, mode: 'insensitive' } } },
          },
          {
            description: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            sender: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            recipient: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            keywords: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            documentNumber: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    if (status) {
      where.AND.push({ status });
    }

    if (modality === 'DIGITAL') {
      where.AND.push({ currentVersion: { gt: 0 } });
    }

    if (modality === 'PHYSICAL') {
      where.AND.push({ currentVersion: 0 });
    }

    if (dateFrom || dateTo) {
      const dateFilter: any = {};

      if (dateFrom) {
        dateFilter.gte = new Date(dateFrom);
      }

      if (dateTo) {
        const inclusiveEndDate = new Date(dateTo);
        inclusiveEndDate.setHours(23, 59, 59, 999);
        dateFilter.lte = inclusiveEndDate;
      }

      where.AND.push({ documentDate: dateFilter });
    }

    if (categoryId) {
      where.AND.push({ categoryId });
    }

    if (documentTypeId) {
      where.AND.push({ documentTypeId });
    }

    if (sectionId) {
      where.AND.push({ category: { sectionId } });
    }

    if (isPublic !== undefined) {
      where.AND.push({ isPublic });
    }

    if (onlyMine) {
      where.AND.push({ uploadedById: userId });
    }

    if (excludeBatched) {
      where.AND.push({ OR: [{ templateData: null }, { templateData: { batchId: null } }] });
    }

    if (batchId) {
      where.AND.push({ templateData: { batchId } });
    }

    if (excludeComposites) {
      where.AND.push({ isComposite: false });
    }

    // Filtro por año lectivo — omitido para roles PADRE y ESTUDIANTE
    const skipYearFilter = (
      ['padre', 'estudiante'] as string[]
    ).includes(userRole as string);
    if (query.academicYearId && !skipYearFilter) {
      where.AND.push({
        OR: [
          { academic: { academicYearId: query.academicYearId } }, { academic: null }, { academic: { academicYearId: null } },
          { category: { bypassAcademicYear: true } },
        ],
      });
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
          academic: true,
          search: true,
          templateData: {
            include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
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
              bypassAcademicYear: true,
              section: {
                select: { id: true, name: true, color: true, icon: true },
              },
            },
          },
          documentType: {
            select: { id: true, name: true },
          },
          
          workflow: {
            select: {
              id: true,
              status: true,
              currentState: true,
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

  async findOne(id: number, userId: string, userRole: string) {
    // Cargar usuario con departmentId para el filtro de acceso
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role?.name as unknown as string,
        })
      : ({ id: -1 } as any);

    // Usar findFirst con el filtro de acceso embebido en el WHERE.
    // Retorna null tanto si el doc no existe como si el usuario no tiene acceso
    // (no revelar la existencia de documentos inaccesibles).
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        ...(accessFilter ?? {}),
      },
      include: {
        academic: true,
        search: true,
        templateData: {
          include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            section: {
              select: { id: true, name: true, color: true, icon: true },
            },
          },
        },
        documentType: {
          select: { id: true, name: true },
        },
        
      },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    return document;
  }

  async update(
    id: number,
    updateDocumentDto: UpdateDocumentDto,
    userId: string,
    userRole: string,
  ) {
    const document = await this.findOne(id, userId, userRole);

    // El dueño, admin, director y vicerrector pueden actualizar cualquier documento
    const canEdit =
      userRole === 'admin' ||
      userRole === 'rector' ||
      userRole === 'vicerrector' ||
      document.uploadedById === userId;
    if (!canEdit) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar este documento',
      );
    }

    const academicData = updateDocumentDto.academic;
    const templateData = updateDocumentDto.templateData;
    const searchData = updateDocumentDto.search;
    
    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        title: updateDocumentDto.title,
        description: updateDocumentDto.description,
        documentDate: updateDocumentDto.documentDate
          ? new Date(updateDocumentDto.documentDate)
          : updateDocumentDto.documentDate === null
            ? null
            : undefined,
        sender: updateDocumentDto.sender,
        recipient: updateDocumentDto.recipient,
        keywords: updateDocumentDto.keywords,
        status: updateDocumentDto.status,
        physicalBuilding: updateDocumentDto.physicalBuilding,
        physicalOffice: updateDocumentDto.physicalOffice,
        physicalArchive: updateDocumentDto.physicalArchive,
        physicalBox: updateDocumentDto.physicalBox,
        physicalNotes: updateDocumentDto.physicalNotes,
        categoryId: updateDocumentDto.categoryId,
        documentTypeId: updateDocumentDto.documentTypeId,
        isPublic: updateDocumentDto.isPublic,
        ...(academicData ? {
          academic: { upsert: { create: { courseId: academicData.courseId, subjectId: academicData.subjectId, academicYearId: academicData.academicYearId }, update: { courseId: academicData.courseId, subjectId: academicData.subjectId, academicYearId: academicData.academicYearId } } }
        } : {}),
        ...(templateData ? {
          templateData: { upsert: { create: { templateId: templateData.templateId, formData: templateData.formData, batchId: templateData.batchId }, update: { templateId: templateData.templateId, formData: templateData.formData, batchId: templateData.batchId } } }
        } : {}),
        ...(searchData ? {
          search: { upsert: { create: { extractedText: searchData.extractedText }, update: { extractedText: searchData.extractedText } } }
        } : {}),
      },
      include: {
        academic: true,
        search: true,
        templateData: {
          include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            section: {
              select: { id: true, name: true, color: true, icon: true },
            },
          },
        },
        documentType: {
          select: { id: true, name: true },
        },
        
      },
    });

    return updatedDocument;
  }

  async remove(id: number, userId: string, userRole: string) {
    const document = await this.findOne(id, userId, userRole);

    // Solo el dueño o admin pueden eliminar
    if (userRole !== 'admin' && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar este documento',
      );
    }

    // SOFT DELETE: Mover archivo a papelera
    const trashPath = this.storage.moveToTrash(
      (document as any).versions[0].path,
      document.id,
      (document as any).versions[0].storedName,
    );

    // Actualizar registro en BD (soft delete)
    await this.prisma.document.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: userId,
      },
    });
    await this.prisma.documentVersion.update({
      where: { id: (document as any).versions[0].id },
      data: { path: trashPath }
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
  async restore(id: number, userId: string, userRole: string) {
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
    if (userRole !== 'admin' && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para restaurar este documento',
      );
    }

    // Generar nueva ruta estructurada
    const storageLocation = this.storage.generateStructuredPath(
      document.uploadedById,
      document.categoryId,
      (document as any).versions[0].storedName,
    );

    // Restaurar archivo desde trash
    this.storage.restoreFromTrash((document as any).versions[0].path, storageLocation.path);

    // Actualizar BD
    await this.prisma.document.update({
      where: { id },
      data: {
        deletedAt: null,
        deletedById: null,
      },
    });
    await this.prisma.documentVersion.update({
      where: { id: (document as any).versions[0].id },
      data: { path: storageLocation.path }
    });

    return { message: 'Documento restaurado exitosamente' };
  }

  /**
   * Eliminar permanentemente un documento
   */
  async permanentDelete(id: number, userId: string, userRole: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Solo admin puede eliminar permanentemente
    if (userRole !== 'admin') {
      throw new ForbiddenException(
        'Solo administradores pueden eliminar permanentemente documentos',
      );
    }

    // Eliminar archivo físico
    this.storage.deleteFile((document as any).versions[0].path);

    // Eliminar thumbnail si existe
    this.thumbnailService.deleteThumbnail(id);

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

  async download(id: number, userId: string, userRole: string) {
    const document = await this.findOne(id, userId, userRole);

    // Verificar que el archivo existe
    if (!this.storage.fileExists((document as any).versions[0].path)) {
      throw new NotFoundException('Archivo no encontrado en el servidor');
    }

    // Verificar integridad del archivo si hay checksum
    if (document.checksumSHA256) {
      const isValid = await this.storage.verifyFileIntegrity(
        (document as any).versions[0].path,
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
      path: (document as any).versions[0].path,
      filename: (document as any).versions[0].filename,
      mimetype: (document as any).versions[0].mimetype,
    };
  }

  async replaceFile(
    id: number,
    file: Express.Multer.File,
    userId: string,
    userRole: string,
    comment?: string,
  ) {
    const document = await this.findOne(id, userId, userRole);

    // Verificar permiso: dueño, admin, o participante con aprobación pendiente en workflow activo
    if (userRole !== 'admin' && document.uploadedById !== userId) {
      const hasPendingApproval = await this.prisma.workflowApproval.findFirst({
        where: {
          workflow: {
            documentId: id,
            status: {
              in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING],
            },
          },
          userId,
          action: null,
        },
      });

      if (!hasPendingApproval) {
        throw new ForbiddenException(
          'No tienes permiso para reemplazar este documento',
        );
      }
    }

    // 1. Copiar versión actual a carpeta de versiones
    const currentDate = new Date(document.createdAt);
    const versionFilename = `${(document as any).versions[0].storedName.split('.')[0]}_v${document.currentVersion}${extname((document as any).versions[0].storedName)}`;
    const versionLocation = this.storage.generateVersionPath(
      document.uploadedById,
      versionFilename,
      currentDate,
    );

    // Copiar archivo actual a versiones (no mover, copiar)
    this.storage.copyFile((document as any).versions[0].path, versionLocation.path);

    // 2. Generar nueva versión
    const newVersion = document.currentVersion + 1;
    const newFilename = `${randomUUID()}${extname(file.originalname)}`;
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
    this.storage.deleteFile((document as any).versions[0].path);

    // 6. Actualizar documento en BD
    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        checksumSHA256: newChecksum,
        currentVersion: newVersion,
      },
      include: {
        academic: true,
        search: true,
        templateData: {
          include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            section: {
              select: { id: true, name: true, color: true, icon: true },
            },
          },
        },
        
      },
    });

    // 7. Regenerar thumbnail con el nuevo archivo
    await this.thumbnailService.regenerateThumbnail(
      newStorageLocation.path,
      id,
      file.mimetype,
    );

    // 8. Detectar workflow activo para tagging de origen (Fix 3)
    const activeWorkflowForSource =
      await this.prisma.documentWorkflow.findFirst({
        where: {
          documentId: id,
          status: { in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING] },
        },
        select: { id: true },
      });

    // 8. Crear registro de nueva versión
    await this.prisma.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        filename: file.originalname,
        mimetype: file.mimetype,
        storedName: newFilename,
        path: newStorageLocation.path,
        size: file.size,
        checksumSHA256: newChecksum,
        comment: comment || `Versión ${newVersion}`,
        createdById: userId,
        source: activeWorkflowForSource
          ? 'CAMBIOS_SOLICITADOS'
          : 'REEMPLAZO_MANUAL',
        workflowId: activeWorkflowForSource?.id ?? null,
      },
    });

    // 8b. Rolling window: eliminar versiones más antiguas si se supera el límite
    const maxVersions = await this.settingsService.getMaxVersionsPerDocument();
    const versionCount = await this.prisma.documentVersion.count({
      where: { documentId: id },
    });
    if (versionCount > maxVersions) {
      const versionsToDelete = await this.prisma.documentVersion.findMany({
        where: { documentId: id },
        orderBy: { version: 'asc' },
        take: versionCount - maxVersions,
      });
      for (const old of versionsToDelete) {
        try {
          if (this.storage.fileExists(old.path))
            this.storage.deleteFile(old.path);
        } catch (_) {}
        await this.prisma.documentVersion.delete({ where: { id: old.id } });
      }
    }

    // 9. Registrar auditoría
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
  async getVersions(id: number, userId: string, userRole: string) {
    const document = await this.findOne(id, userId, userRole);

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        approvals: {
          select: {
            id: true,
            action: true,
            user: { select: { name: true } },
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
    userRole: string,
  ) {
    const document = await this.findOne(documentId, userId, userRole);

    // Solo el dueño o admin pueden restaurar versiones
    if (userRole !== 'admin' && document.uploadedById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para restaurar versiones de este documento',
      );
    }

    // Fix 1: Bloquear restauración si hay workflow activo
    const activeWorkflow = await this.prisma.documentWorkflow.findFirst({
      where: {
        documentId,
        status: { in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING] },
      },
      select: { currentState: true },
    });
    if (activeWorkflow) {
      throw new ConflictException(
        `No se puede restaurar una versión mientras el documento tiene un workflow activo` +
          ` (etapa: "${activeWorkflow.currentState}"). Cancela el workflow primero.`,
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
    const currentVersionFilename = `${(document as any).versions[0].storedName.split('.')[0]}_v${document.currentVersion}${extname((document as any).versions[0].storedName)}`;
    const currentVersionLocation = this.storage.generateVersionPath(
      document.uploadedById,
      currentVersionFilename,
      new Date(document.createdAt),
    );

    this.storage.copyFile((document as any).versions[0].path, currentVersionLocation.path);

    // 2. Copiar archivo de la versión solicitada a ubicación principal
    const newFilename = `${randomUUID()}${extname(version.storedName)}`;
    const newLocation = this.storage.generateStructuredPath(
      document.uploadedById,
      document.categoryId,
      newFilename,
    );

    this.storage.copyFile(version.path, newLocation.path);

    // 3. Eliminar archivo actual
    this.storage.deleteFile((document as any).versions[0].path);

    // 4. Actualizar documento en BD
    const updatedDocument = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        checksumSHA256: version.checksumSHA256,
        currentVersion,
      },
    });

    // 5. Crear registro de versión restaurada
    await this.prisma.documentVersion.create({
      data: {
        documentId,
        version: currentVersion,
        filename: version.filename,
        mimetype: version.mimetype,
        storedName: newFilename,
        path: newLocation.path,
        size: version.size,
        checksumSHA256: version.checksumSHA256,
        comment: `Restaurada desde versión ${versionNumber}`,
        createdById: userId,
        source: 'RESTAURACION',
      },
    });

    return updatedDocument;
  }

  async getStats(userId: string, userRole: string) {
    const where: any = { deletedAt: null }; // Excluir eliminados

    if (userRole !== 'admin') {
      where.uploadedById = userId;
    }

    const [totalDocuments, totalSize] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.aggregate({
        where,
        _sum: { currentVersion: true },
      }),
    ]);

    return {
      totalDocuments,
      totalSize: 0, // Migrated to DocumentVersion
      totalSizeMB: '0.00',
    };
  }

  async getCategories(userId: string, userRole: string) {
    const where: any = { deletedAt: null }; // Excluir eliminados

    if (userRole !== 'admin') {
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

  /**
   * Obtener documentos agrupados por fecha para vista de calendario
   */
  async getDocumentsByDate(
    userId: string,
    userRole: string,
    startDate?: Date,
    endDate?: Date,
    categoryId?: number,
    sectionId?: number,
  ) {
    const where: any = {
      AND: [{ deletedAt: null }],
    };

    // Permisos: solo documentos propios o públicos si no es admin
    if (userRole !== 'admin') {
      where.AND.push({
        OR: [{ uploadedById: userId }, { isPublic: true }],
      });
    }

    // Filtro por rango de fechas
    if (startDate && endDate) {
      where.AND.push({
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      });
    }

    // Filtros opcionales
    if (categoryId) {
      where.AND.push({ categoryId });
    }

    if (sectionId) {
      where.AND.push({ category: { sectionId } });
    }

    const documents = await this.prisma.document.findMany({
      where,
      include: {
        academic: true,
        search: true,
        templateData: {
          include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
        },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        uploadedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
            section: {
              select: { id: true, name: true, color: true, icon: true },
            },
          },
        },
        
      },
      orderBy: { createdAt: 'desc' },
    });

    // Agrupar por fecha
    const groupedByDate = documents.reduce(
      (acc, doc) => {
        const dateKey = new Date(doc.createdAt).toISOString().split('T')[0];
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(doc);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    return {
      documents,
      groupedByDate,
      totalDocuments: documents.length,
    };
  }

  // ============ Archivo histórico ============

  /**
   * Listar documentos archivados con paginación y filtros
   */
  async findArchived(
    query: {
      search?: string;
      categoryId?: number;
      page?: number;
      limit?: number;
    },
    userId: string,
    userRole: string,
  ) {
    const { search, categoryId, page = 1, limit = 50 } = query;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role?.name as unknown as string,
        })
      : null;

    const where: any = {
      AND: [{ deletedAt: null }, { path: { contains: '/archive/' } }],
    };

    if (accessFilter) {
      where.AND.push(accessFilter);
    }

    if (search) {
      where.AND.push({
        OR: [
          { filename: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (categoryId) {
      where.AND.push({ categoryId });
    }

    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          academic: true,
          search: true,
          templateData: {
            include: { template: { select: { id: true, name: true, documentType: { select: { id: true, name: true } } } }, batch: { select: { id: true, name: true } } }
          },
          versions: { orderBy: { version: 'desc' }, take: 1 },
          uploadedBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
              section: {
                select: { id: true, name: true, color: true, icon: true },
              },
            },
          },
          
        },
        orderBy: { archivedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data: documents,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Estadísticas del archivo histórico: total y distribución por categoría
   */
  async getArchiveStats(userId: string, userRole: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role?.name as unknown as string,
        })
      : null;

    const baseWhere: any = {
      AND: [
        { deletedAt: null },
        { path: { contains: '/archive/' } },
        ...(accessFilter ? [accessFilter] : []),
      ],
    };

    const [total, byCategory] = await Promise.all([
      this.prisma.document.count({ where: baseWhere }),
      this.prisma.document.groupBy({
        by: ['categoryId'],
        where: { ...baseWhere, categoryId: { not: null } },
        _count: { categoryId: true },
        orderBy: { _count: { categoryId: 'desc' } },
      }),
    ]);

    const categoryIds = byCategory
      .map((b) => b.categoryId)
      .filter(Boolean) as number[];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, color: true },
    });
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    return {
      total,
      byCategory: byCategory.map((b) => ({
        categoryId: b.categoryId,
        categoryName: catMap[b.categoryId!]?.name ?? 'Sin categoría',
        categoryColor: catMap[b.categoryId!]?.color ?? '#6b7280',
        count: b._count.categoryId,
      })),
    };
  }

  /**
   * Restaurar documento desde el archivo histórico al activo
   */
  async restoreFromArchive(id: number, userId: string, userRole: string) {
    const document = await this.prisma.document.findUnique({ where: { id } });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (!(document as any).versions[0].path.includes('/archive/')) {
      throw new BadRequestException('El documento no está archivado');
    }

    const canRestore =
      userRole === 'admin' ||
      userRole === 'rector' ||
      userRole === 'vicerrector' ||
      document.uploadedById === userId;

    if (!canRestore) {
      throw new ForbiddenException(
        'No tienes permiso para restaurar este documento',
      );
    }

    const storageLocation = this.storage.generateStructuredPath(
      document.uploadedById,
      document.categoryId,
      (document as any).versions[0].storedName,
    );

    this.storage.moveFile((document as any).versions[0].path, storageLocation.path);

    await this.prisma.document.update({
      where: { id },
      data: { archivedAt: null },
    });
    await this.prisma.documentVersion.update({
      where: { id: (document as any).versions[0].id },
      data: { path: storageLocation.path }
    });

    return { message: 'Documento restaurado al archivo activo exitosamente' };
  }

  // ============ Extracción de Texto de PDFs ============

  /**
   * Extrae texto de un archivo PDF usando pdf-parse
   * @param filePath Ruta del archivo PDF
   * @returns Texto extraído o null si falla
   */
  private async extractTextFromPDF(filePath: string): Promise<string | null> {
    try {
      const dataBuffer = await readFileAsync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || null;
    } catch (error) {
      console.error(`Error extrayendo texto del PDF ${filePath}:`, error);
      return null;
    }
  }
}
