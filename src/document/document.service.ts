// src/documents/documents.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
  Optional,
} from '@nestjs/common';
import { AuditAction, AuditResource, Prisma, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditLogPage, AuditWriter } from '../audit/audit.types';
import { AuditLogQueryDto } from '../audit/dto/audit-log-query.dto';
import { StorageService } from '../storage/storage.service';
import { ThumbnailService } from './thumbnail.service';
import { DocumentPageCountService } from './document-page-count.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import * as fs from 'fs';
import { extname, resolve } from 'path';
import { promisify } from 'util';
import { UserRole } from '../auth/role.enum';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { randomUUID } from 'crypto';
import { sharingManagerSelect, canManageDocumentSharing, assertSharingManager, assertSharingDocumentAvailable } from '../auth/utils/document-sharing.policy';
import { SettingsService } from '../settings/settings.service';
import { DocumentNumberingService } from './document-numbering.service';
import { DirectoryService } from '../directory/directory.service';
import { resolveReceptionCapabilities } from '../directory/directory-reception.policy';
import { assertWorkflowEditable as assertWorkflowEditablePolicy } from './document-workflow-edit.policy';
import { resolveEffectiveRoleKeys } from '../role/compatibility-resolver';
import { resolveDocumentActionCapabilities, DocumentActionCapabilities } from './document-action-capabilities';
import { resolveBatchActionCapabilities, BatchActionCapabilities } from '../batch/batch-action-capabilities';
import { TextExtractionService } from './text-extraction/text-extraction.service';
import { PdfOcrService } from './text-extraction/pdf-ocr.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UploadMultipleDocumentsDto } from './dto/upload-multiple-documents.dto';
import { calendarDate, uploadDay, inferAcademicYear } from './upload-date';
import { getVersionRetention, retentionEvidenceInclude, retentionOverride } from './document-version-retention';
import { UpdateVersionRetentionDto } from './dto/update-version-retention.dto';
import { loadInheritedAccess, requireResourceAccess, SharingSummary } from '../directory/inherited-access.policy';
import { assertChangeRequestDocument, assertChangeRequestManager, changeRequestActorSelect } from '../document-change-request/document-change-request.policy';

const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private settingsService: SettingsService,
    private thumbnailService: ThumbnailService,
    private numberingService: DocumentNumberingService,
    private directoryService: DirectoryService,
    private textExtractionService: TextExtractionService,
    private pdfOcrService: PdfOcrService,
    // Unified audit trail. Injection is optional so pre-existing direct
    // constructors keep compiling; DocumentModule always provides it.
    @Optional() private readonly auditService?: AuditService,
    // Metadato derivado del recuento de páginas. Como la auditoría, la inyección
    // es opcional para que los constructores directos sigan compilando;
    // DocumentModule siempre lo provee.
    @Optional() private readonly pageCountService?: DocumentPageCountService,
  ) {}

  // Resolves the persisted default document type used when a caller does not
  // request a concrete type. Returns null when no default is configured so
  // callers keep the previous "no concrete type" behavior instead of failing.
  private findDefaultDocumentType() {
    return this.prisma.documentType.findFirst({
      where: { isDefault: true, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, isActive: true, categoryId: true },
    });
  }

  private async prepareUpload(
    uploadDocumentDto: UploadDocumentDto,
    userId: string,
    userRole: UserRole,
    createdAt: Date,
  ) {
    uploadDocumentDto = this.validateMetadata(
      UploadDocumentDto,
      uploadDocumentDto,
    );
    if (uploadDocumentDto.documentNumber !== undefined) {
      const existing = await this.prisma.document.findUnique({
        where: { documentNumber: uploadDocumentDto.documentNumber },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('El número institucional ya está en uso');
      }
    }
    // An omitted or null type resolves to the persisted default active type;
    // only an explicit concrete id is validated against existence/activity.
    const requestedDocumentTypeId = uploadDocumentDto.documentTypeId ?? null;
    const documentType =
      requestedDocumentTypeId === null
        ? await this.findDefaultDocumentType()
        : await this.prisma.documentType.findUnique({
            where: { id: requestedDocumentTypeId },
            select: { id: true, isActive: true, categoryId: true },
          });
    if (requestedDocumentTypeId !== null && !documentType) {
      throw new BadRequestException('El tipo de documento no existe');
    }
    if (documentType && !documentType.isActive) {
      throw new BadRequestException('El tipo de documento está inactivo');
    }

    if (
      documentType &&
      uploadDocumentDto.categoryId !== undefined &&
      uploadDocumentDto.categoryId !== documentType.categoryId
    ) {
      throw new BadRequestException(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
    }

    const resolvedCategoryId =
      documentType?.categoryId ?? uploadDocumentDto.categoryId ?? null;
    const category =
      resolvedCategoryId === null
        ? null
        : await this.prisma.category.findUnique({
            where: { id: resolvedCategoryId },
            select: { id: true, allowedRoles: true, requiresCourse: true },
          });
    if (resolvedCategoryId !== null && !category) {
      throw new BadRequestException(
        'La categoría asociada al tipo de documento no existe',
      );
    }

    const uploadDirectoryId =
      uploadDocumentDto.directoryId === undefined
        ? undefined
        : Number(uploadDocumentDto.directoryId);
    if (uploadDirectoryId !== undefined) {
      await this.directoryService.assertCanUpload(uploadDirectoryId, {
        id: userId,
        role: userRole,
      });
    }

    const originDate = calendarDate(
      uploadDocumentDto.originDate ?? uploadDay(createdAt),
    );
    const years = await this.prisma.academicYear.findMany({
      select: { id: true, startDate: true, endDate: true },
    });
    const inference = inferAcademicYear(
      uploadDocumentDto.originDate ?? uploadDay(createdAt),
      years,
    );
    return {
      uploadDocumentDto,
      documentType,
      resolvedCategoryId,
      uploadDirectoryId,
      originDate,
      createdAt,
      ...inference,
    };
  }

  // Resolves and validates the category/type pair for a partial update. A
  // concrete `documentTypeId` requires existence and activity and derives its
  // category; an explicit `null` resolves to the persisted default active type
  // and derives its category; a category-only change must not invalidate a
  // concrete type already set.
  private async resolveUpdateClassification(
    document: { documentTypeId?: number | null; categoryId?: number | null },
    updateDocumentDto: UpdateDocumentDto,
  ): Promise<{ documentTypeId?: number | null; categoryId?: number | null }> {
    const typeProvided = updateDocumentDto.documentTypeId !== undefined;
    const categoryProvided = updateDocumentDto.categoryId !== undefined;

    if (typeProvided && updateDocumentDto.documentTypeId !== null) {
      const documentType = await this.prisma.documentType.findUnique({
        where: { id: updateDocumentDto.documentTypeId },
        select: { id: true, isActive: true, categoryId: true },
      });
      if (!documentType) {
        throw new BadRequestException('El tipo de documento no existe');
      }
      if (!documentType.isActive) {
        throw new BadRequestException('El tipo de documento está inactivo');
      }
      if (
        categoryProvided &&
        updateDocumentDto.categoryId !== documentType.categoryId
      ) {
        throw new BadRequestException(
          'La categoría indicada no corresponde al tipo de documento seleccionado',
        );
      }
      return {
        documentTypeId: documentType.id,
        categoryId: documentType.categoryId,
      };
    }

    if (typeProvided) {
      // An explicit `documentTypeId: null` no longer clears to a null
      // "generic": it resolves to the persisted default active type and
      // derives its category, keeping the category/type pair consistent.
      const defaultType = await this.findDefaultDocumentType();
      if (!defaultType) {
        // No default configured: keep the previous null behavior and apply a
        // category only when the caller provides one explicitly.
        return {
          documentTypeId: null,
          ...(categoryProvided ? { categoryId: updateDocumentDto.categoryId } : {}),
        };
      }
      if (
        categoryProvided &&
        updateDocumentDto.categoryId !== defaultType.categoryId
      ) {
        throw new BadRequestException(
          'La categoría indicada no corresponde al tipo de documento seleccionado',
        );
      }
      return {
        documentTypeId: defaultType.id,
        categoryId: defaultType.categoryId,
      };
    }

    if (categoryProvided) {
      const existingTypeId = document.documentTypeId ?? null;
      if (existingTypeId !== null) {
        const existingType = await this.prisma.documentType.findUnique({
          where: { id: existingTypeId },
          select: { id: true, isActive: true, categoryId: true },
        });
        if (
          existingType &&
          existingType.categoryId !== updateDocumentDto.categoryId
        ) {
          throw new BadRequestException(
            'La categoría indicada no corresponde al tipo de documento seleccionado',
          );
        }
      }
      return { categoryId: updateDocumentDto.categoryId };
    }

    return {};
  }

  private validateMetadata<T extends object>(
    type: new () => T,
    value: unknown,
  ): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(
        'Los metadatos del documento deben ser un objeto',
      );
    }
    const dto = plainToInstance(type, value);
    if (
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length
    ) {
      throw new BadRequestException(
        'Verifica la descripción, el tipo de documento y la fecha de origen de cada archivo',
      );
    }
    return dto;
  }

  private async prepareUploadBlob(
    file: Express.Multer.File,
    uploadDocumentDto: UploadDocumentDto,
    userId: string,
    userRole: UserRole = UserRole.USER,
    prepared?: Awaited<ReturnType<DocumentService['prepareUpload']>>,
  ) {
    const context =
      prepared ??
      (await this.prepareUpload(
        uploadDocumentDto,
        userId,
        userRole,
        new Date(),
      ));
    const {
      documentType,
      resolvedCategoryId,
      uploadDirectoryId,
      originDate,
      createdAt,
      academicYearId: resolvedAcademicYearId,
      warning,
    } = context;
    uploadDocumentDto = context.uploadDocumentDto;

    // 2. Generar nombre único y ruta estructurada
    const uniqueFilename = `${randomUUID()}${extname(file.originalname)}`;
    const storageLocation = this.storage.generateStructuredPath(
      userId,
      resolvedCategoryId,
      uniqueFilename,
    );

    const templateData = uploadDocumentDto.templateData;
    try {
      // La finalización y extracción se compensan sin mantener bloqueos de BD.
      this.storage.moveFile(file.path, storageLocation.path);
      const checksum = await this.storage.calculateFileHash(
        storageLocation.path,
      );
      const extractedText = await this.extractCurrentText(
        storageLocation.path,
        file.mimetype,
      );

      const args = Prisma.validator<Prisma.DocumentCreateArgs>()({
        data: {
          name: uploadDocumentDto.name ?? file.originalname,
          documentNumber: uploadDocumentDto.documentNumber,
          description: uploadDocumentDto.description,
          originDate,
          createdAt,
          categoryId: resolvedCategoryId,
          documentTypeId: documentType?.id ?? null,
          isPublic: uploadDocumentDto.isPublic || false,
          uploadedById: userId,
          directoryId: uploadDirectoryId ?? null,
          checksumSHA256: checksum,
          currentVersion: 1,

          academic: { create: { academicYearId: resolvedAcademicYearId } },

          ...(templateData
            ? {
                templateData: {
                  create: {
                    templateId: templateData.templateId,
                    formData: templateData.formData,
                    batchId: templateData.batchId,
                  },
                },
              }
            : {}),

          search: { create: { extractedText } },

          versions: {
            create: [
              {
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
              },
            ],
          },
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
            },
          },
          documentType: {
            select: { id: true, name: true },
          },
          workflow: {
            where: { active: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              currentState: true,
              documentVersionId: true,
            },
          },
        },
      });
      return { args, context, storageLocation, file };
    } catch (error) {
      try {
        this.storage.deleteFile(storageLocation.path);
      } catch (cleanupError) {
        console.error(
          `No se pudo limpiar el archivo ${storageLocation.path}:`,
          cleanupError,
        );
        throw new BadRequestException(
          'No se pudo completar la carga ni limpiar el archivo preparado',
        );
      }
      const databaseError = error as { code?: string; meta?: { target?: unknown } };
      if (
        databaseError?.code === 'P2002' &&
        String(databaseError.meta?.target).includes('documentNumber')
      ) {
        throw new ConflictException('El número institucional ya está en uso');
      }
      throw error;
    }

  }

  private cleanupPreparedUploads(blobs: Awaited<ReturnType<DocumentService['prepareUploadBlob']>>[]) {
    let failed = false;
    for (const blob of blobs) {
      try { this.storage.deleteFile(blob.storageLocation.path); } catch { failed = true; }
    }
    if (failed) throw new BadRequestException('No se pudo completar la carga ni limpiar todos los archivos preparados');
  }

  private async persistPreparedUploads(
    blobs: Awaited<ReturnType<DocumentService['prepareUploadBlob']>>[],
    userId: string,
    userRole: UserRole,
  ) {
    let documents: Prisma.DocumentGetPayload<Awaited<ReturnType<DocumentService['prepareUploadBlob']>>['args']>[];
    try {
      documents = await this.directoryService.submissionTransaction(async db => {
        const result = [];
        for (const blob of blobs) {
          const origin = await this.directoryService.prepareSubmission(db, blob.context.uploadDirectoryId ?? null, { id: userId, role: userRole });
          if (origin != null && blob.args.data.isPublic) throw new ForbiddenException('Los documentos de recepción no pueden ser públicos');
          const document = await db.document.create({ ...blob.args, data: { ...blob.args.data, receptionOriginDirectoryId: origin } });
          await this.directoryService.recordSubmission(db, { id: document.id, uploadedById: userId }, origin);
          await this.appendLifecycleAudit(
            {
              action: AuditAction.CREATE,
              documentId: document.id,
              metadata: {
                filename: blob.file.originalname,
                mimetype: blob.file.mimetype,
                size: blob.file.size,
                documentTypeId: blob.context.documentType?.id ?? null,
                categoryId: blob.context.resolvedCategoryId,
                directoryId: blob.context.uploadDirectoryId ?? null,
              },
            },
            db,
          );
          result.push(document);
        }
        return result;
      });
    } catch (error) {
      this.cleanupPreparedUploads(blobs);
      const databaseError = error as { code?: string; meta?: { target?: unknown } };
      if (databaseError?.code === 'P2002' && String(databaseError.meta?.target).includes('documentNumber')) {
        throw new ConflictException('El número institucional ya está en uso');
      }
      throw error;
    }
    // Solo después de confirmar TODO el lote se producen efectos derivados.
    const result = [];
    for (const [index, document] of documents.entries()) {
      const { storageLocation, file, context } = blobs[index];
      this.thumbnailService.regenerateThumbnail(storageLocation.path, document.id, file.mimetype).catch(() => {});
      this.enqueueOcr(document.id, document.currentVersion, document.search?.extractedText ?? null, document.versions?.[0]);
      const uploadedVersion = document.versions?.[0];
      if (uploadedVersion)
        this.pageCountService?.record(uploadedVersion).catch(() => {});
      const warnings = context.warning ? [context.warning] : [];
      result.push({ ...document, warnings });
    }
    return result;
  }

  async upload(
    file: Express.Multer.File,
    metadata: UploadDocumentDto,
    userId: string,
    userRole: UserRole = UserRole.USER,
    prepared?: Awaited<ReturnType<DocumentService['prepareUpload']>>,
  ) {
    const blob = await this.prepareUploadBlob(file, metadata, userId, userRole, prepared);
    return (await this.persistPreparedUploads([blob], userId, userRole))[0];
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    uploadDocumentDto: UploadMultipleDocumentsDto,
    userId: string,
    userRole: UserRole = UserRole.USER,
  ) {
    uploadDocumentDto = this.validateMetadata(
      UploadMultipleDocumentsDto,
      uploadDocumentDto,
    );
    if (
      !files?.length ||
      files.length > 10 ||
      uploadDocumentDto.metadata.length !== files.length
    ) {
      throw new BadRequestException(
        'Debe existir un conjunto de metadatos por archivo, con un máximo de 10 archivos',
      );
    }
    const numbers = new Set<string>();
    for (const metadata of uploadDocumentDto.metadata) {
      if (metadata.documentNumber === undefined) continue;
      if (numbers.has(metadata.documentNumber)) {
        throw new BadRequestException(
          'El número institucional está repetido en la carga',
        );
      }
      numbers.add(metadata.documentNumber);
    }
    const uploadDirectoryId =
      uploadDocumentDto.directoryId === undefined
        ? undefined
        : Number(uploadDocumentDto.directoryId);
    if (uploadDirectoryId !== undefined) {
      await this.directoryService.assertCanUpload(uploadDirectoryId, {
        id: userId,
        role: userRole,
      });
    }
    const createdAt = new Date();
    const prepared = [];
    for (const metadata of uploadDocumentDto.metadata) {
      prepared.push(
        await this.prepareUpload(
          { ...metadata, directoryId: uploadDirectoryId },
          userId,
          userRole,
          createdAt,
        ),
      );
    }
    const blobs: Awaited<ReturnType<DocumentService['prepareUploadBlob']>>[] = [];
    try {
      for (const [index, file] of files.entries()) {
        blobs.push(await this.prepareUploadBlob(file, prepared[index].uploadDocumentDto, userId, userRole, prepared[index]));
      }
    } catch (error) {
      this.cleanupPreparedUploads(blobs);
      throw error;
    }
    return this.persistPreparedUploads(blobs, userId, userRole);
  }

  async findAll(query: QueryDocumentDto, userId: string, userRole: UserRole) {
    const {
      search,
      categoryId,
      documentTypeId,
      isPublic,
      includeDeleted,
      onlyMine,
      excludeBatched,
      batchId,
      page = 1,
      limit = 10,
      excludeComposites,
      directoryId,
      view,
    } = query;
    const isUnfilteredView =
      view === 'recent-accessed' || view === 'recent-created' || view === 'all';

    const requestedDirectoryId =
      directoryId === undefined || directoryId === null
        ? directoryId
        : Number(directoryId);
    if (requestedDirectoryId !== undefined && requestedDirectoryId !== null) {
      await this.directoryService.assertDiscoverable(requestedDirectoryId, {
        id: userId,
        role: userRole,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { id: true, key: true, isActive: true } } },
        },
      },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role as unknown as UserRole,
          assignments: (user.roleAssignments ?? []).map(({ role }) => role),
        })
      : ({ id: -1 } as any);

    // Construir filtros
    const where: any = {
      AND: [],
    };

    const quarantinedDocumentIds = await this.quarantinedDocumentIds();
    if (quarantinedDocumentIds.length) {
      where.AND.push({ id: { notIn: quarantinedDocumentIds } });
    }

    // Filtrar documentos eliminados (soft delete)
    if (view === 'trash') {
      where.AND.push({ deletedAt: { not: null } });
    } else if (view === 'all' || !includeDeleted) {
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
          { name: { contains: search, mode: 'insensitive' } },
          {
            versions: {
              some: { filename: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            description: {
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

    if (categoryId) {
      where.AND.push({ categoryId });
    }

    if (documentTypeId) {
      where.AND.push({ documentTypeId });
    }

    if (isPublic !== undefined) {
      where.AND.push({ isPublic });
    }

    if (onlyMine) {
      where.AND.push({ uploadedById: userId });
    }

    if (excludeBatched && !isUnfilteredView) {
      where.AND.push({
        OR: [{ templateData: null }, { templateData: { batchId: null } }],
      });
    }

    if (batchId) {
      where.AND.push({ templateData: { batchId } });
    }

    if (excludeComposites && !isUnfilteredView) {
      where.AND.push({ isComposite: false });
    }

    if (requestedDirectoryId !== undefined) {
      where.AND.push({ directoryId: requestedDirectoryId ?? null });
    }

    // Filtro por año lectivo — omitido para roles PADRE y ESTUDIANTE
    const skipYearFilter = (
      [UserRole.PADRE, UserRole.ESTUDIANTE] as string[]
    ).includes(userRole as string);
    if (query.academicYearId && !skipYearFilter && !isUnfilteredView) {
      where.AND.push({
        OR: [
          { academic: { academicYearId: query.academicYearId } },
          { academic: null },
          { academic: { academicYearId: null } },
          { category: { bypassAcademicYear: true } },
        ],
      });
    }

    let recentAccessDocumentIds: number[] | undefined;
    if (view === 'recent-accessed') {
      const recentAccesses = await this.prisma.documentAccess.findMany({
        where: {
          userId,
          action: { in: ['VIEW', 'DOWNLOAD', 'UPDATE'] },
          document: where,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        distinct: ['documentId'],
        select: { documentId: true },
      });
      recentAccessDocumentIds = Array.from(
        new Set(recentAccesses.map(({ documentId }) => documentId)),
      );
      where.AND.push({ id: { in: recentAccessDocumentIds } });
    }

    // Si no hay condiciones AND, usar objeto vacío
    if (where.AND.length === 0) {
      delete where.AND;
    }

    // Paginación
    const skip = (page - 1) * limit;

    const documentQuery = {
      where,
      skip: undefined as number | undefined,
      take: undefined as number | undefined,
      include: {
        directory: { select: { id: true, receptionEnabled: true } },
        academic: true,
        search: true,
        templateData: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
            batch: { select: { id: true, name: true } },
          },
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    } satisfies Prisma.DocumentFindManyArgs;
    if (view !== 'recent-accessed') {
      documentQuery.skip = skip;
      documentQuery.take = limit;
    }

    const [documents, total] = await Promise.all([
      this.prisma.document.findMany(documentQuery),
      this.prisma.document.count({ where }),
    ]);

    const orderedDocuments = recentAccessDocumentIds
      ? recentAccessDocumentIds
          .map((id) => documents.find((document) => document.id === id))
          .filter(Boolean)
      : documents;
    const pagedDocuments = recentAccessDocumentIds
      ? orderedDocuments.slice(skip, skip + limit)
      : orderedDocuments;

    const capabilitiesByDocument = await this.loadDocumentActionCapabilities(
      pagedDocuments,
      user,
    );

    return {
      data: pagedDocuments.map((document) => {
        const capabilities = capabilitiesByDocument.get(document.id)!;
        return { ...document, canManageSharing: capabilities.actionCapabilities.manageSharing, ...capabilities };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    id: number,
    userId: string,
    userRole: UserRole,
    includeCapabilities = false,
  ) {
    const quarantinedDocumentIds = await this.quarantinedDocumentIds();
    if (quarantinedDocumentIds.includes(id)) {
      throw new NotFoundException('Documento no encontrado');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { id: true, key: true, isActive: true } } },
        },
      },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role as unknown as UserRole,
          assignments: (user.roleAssignments ?? []).map(({ role }) => role),
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
        directory: { select: { id: true, receptionEnabled: true } },
        academic: true,
        search: true,
        templateData: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
            batch: { select: { id: true, name: true } },
          },
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
          },
        },
        documentType: {
          select: { id: true, name: true },
        },
        workflow: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            currentState: true,
            documentVersionId: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (includeCapabilities) {
      // La lectura de detalle adjunta la instantánea de capacidades sin registrar
      // una visualización: los eventos VIEW corresponden al acceso al archivo.
      // Las lecturas internas de mutación conservan el contrato previo sin
      // resolver capacidades por documento.
      const capabilities = (
        await this.loadDocumentActionCapabilities([document], user)
      ).get(document.id)!;
      return { ...document, canManageSharing: capabilities.actionCapabilities.manageSharing, ...capabilities };
    }

    // La lectura de recepción nunca concede autoridad para compartir el documento.
    return { ...document, canManageSharing: !document.receptionOriginDirectoryId && !document.directory?.receptionEnabled && canManageDocumentSharing(document, user), actionCapabilities: undefined, batchCapabilities: undefined, sharingProvenance: undefined, sharingSummary: undefined };
  }

  // Resuelve las capacidades de acción solo para los documentos devueltos,
  // con el actor vigente de base de datos y consultas por lote acotadas. Nunca
  // consulta por documento ni reutiliza el rol enviado por el llamador.
  private async loadDocumentActionCapabilities(
    documents: Array<{
      id: number;
      directoryId?: number | null;
      isPublic?: boolean;
      uploadedById: string;
      deletedAt?: Date | null;
      archivedAt?: Date | null;
      receptionOriginDirectoryId?: number | null;
      directory?: { id?: number | null; receptionEnabled?: boolean | null } | null;
    }>,
    user:
      | {
          id?: string | null;
          role?: string | null;
          roleAssignments?: Array<{ role: { key: string; isActive: boolean } }> | null;
        }
      | null,
  ): Promise<Map<number, { canRequestChanges: boolean; actionCapabilities: DocumentActionCapabilities; batchCapabilities: BatchActionCapabilities; sharingProvenance: any[]; sharingSummary: SharingSummary | undefined }>> {
    const result = new Map<number, { canRequestChanges: boolean; actionCapabilities: DocumentActionCapabilities; batchCapabilities: BatchActionCapabilities; sharingProvenance: any[]; sharingSummary: SharingSummary | undefined }>();
    if (!documents.length) return result;

    const actorId = user?.id ?? null;
    // El rol del actor llega sin normalizar (AuthGuard: request.user.role =
    // currentUser.role); el servicio compara contra los UserRole exactos. La
    // autoridad de ruta @Roles(ADMIN) usa claves efectivas, como RolesGuard.
    const legacyRole = user?.role ?? null;
    const legacyServiceAdmin = legacyRole === UserRole.ADMIN;
    const isLegacyPrivilegedEditor =
      legacyRole === UserRole.ADMIN ||
      legacyRole === UserRole.RECTOR ||
      legacyRole === UserRole.VICERRECTOR;
    const effectiveAdminRoute = user
      ? resolveEffectiveRoleKeys(
          user.role,
          (user.roleAssignments ?? []).map((assignment) => assignment.role),
        ).includes(UserRole.ADMIN)
      : false;
    const actor =
      actorId && user
        ? {
            id: actorId,
            legacyServiceAdmin,
            isLegacyPrivilegedEditor,
            effectiveAdminRoute,
          }
        : null;
    // El origen durable manda; se deduplican los IDs de carpeta de recepción.
    const receptionDirectoryByDocument = new Map<number, number>();
    for (const document of documents) {
      const currentId = document.directory?.receptionEnabled
        ? document.directory.id
        : null;
      const directoryId =
        document.receptionOriginDirectoryId ?? currentId ?? null;
      if (directoryId != null) {
        receptionDirectoryByDocument.set(document.id, directoryId);
      }
    }
    const receptionDirectoryIds = Array.from(
      new Set(receptionDirectoryByDocument.values()),
    );
    const documentIds = documents.map((document) => document.id);
    const ordinaryAccess = await loadInheritedAccess(this.prisma, documents, actorId, 'document', true);

    let workflows: Array<{
      documentId: number;
      status: WorkflowStatus;
      initiatedById: string | null;
    }> = [];
    let approvals: Array<{ workflow: { documentId: number } }> = [];
    let directGrants: Array<{ documentId: number; canEdit: boolean; canDelete: boolean; canView: boolean }> = [];
    if (actorId) {
      [workflows, approvals, directGrants] = await Promise.all([
        this.prisma.documentWorkflow.findMany({
          where: { documentId: { in: documentIds }, active: true },
          select: { documentId: true, status: true, initiatedById: true },
        }),
        this.prisma.workflowApproval.findMany({
          where: {
            userId: actorId,
            action: null,
            workflow: {
              documentId: { in: documentIds },
              status: {
                in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING],
              },
            },
          },
          select: { workflow: { select: { documentId: true } } },
        }),
        this.prisma.documentPermission.findMany({
          where: { documentId: { in: documentIds }, userId: actorId },
          select: { documentId: true, canEdit: true, canDelete: true, canView: true },
        }),
      ]);
    }

    const directoryById = new Map<
      number,
      { id: number; createdById: string; receptionEnabled: boolean }
    >();
    const directParticipantByDirectory = new Map<number, { peerRead: boolean }>();
    const roleParticipantsByDirectory = new Map<number, Array<{ peerRead: boolean }>>();
    const delegateByDirectory = new Map<number, Record<string, unknown>>();
    if (actorId && receptionDirectoryIds.length) {
      const [directories, directParticipants, roleParticipants, delegates] =
        await Promise.all([
          this.prisma.directory.findMany({
            where: { id: { in: receptionDirectoryIds } },
            select: { id: true, createdById: true, receptionEnabled: true },
          }),
          this.prisma.directoryUserParticipant.findMany({
            where: { directoryId: { in: receptionDirectoryIds }, userId: actorId },
            select: { directoryId: true, peerRead: true },
          }),
          this.prisma.directoryRoleParticipant.findMany({
            where: {
              directoryId: { in: receptionDirectoryIds },
              role: { isActive: true, assignments: { some: { userId: actorId } } },
            },
            select: { directoryId: true, peerRead: true },
          }),
          this.prisma.directoryDelegate.findMany({
            where: { directoryId: { in: receptionDirectoryIds }, userId: actorId },
          }),
        ]);
      for (const directory of directories) directoryById.set(directory.id, directory);
      for (const participant of directParticipants) {
        directParticipantByDirectory.set(participant.directoryId, participant);
      }
      for (const participant of roleParticipants) {
        const list = roleParticipantsByDirectory.get(participant.directoryId) ?? [];
        list.push(participant);
        roleParticipantsByDirectory.set(participant.directoryId, list);
      }
      for (const delegate of delegates) {
        delegateByDirectory.set(delegate.directoryId, delegate);
      }
    }

    const activeBlockingDocuments = new Set<number>();
    const changesRequestedByActorDocuments = new Set<number>();
    const activeReviewDocuments = new Set<number>();
    const blockingStatuses: WorkflowStatus[] = [
      WorkflowStatus.PENDING,
      WorkflowStatus.IN_PROGRESS,
      WorkflowStatus.CHANGES_REQUESTED,
    ];
    const terminalStatuses: WorkflowStatus[] = [
      WorkflowStatus.APPROVED,
      WorkflowStatus.REJECTED,
      WorkflowStatus.CANCELLED,
    ];
    for (const workflow of workflows) {
      if (blockingStatuses.includes(workflow.status)) {
        activeBlockingDocuments.add(workflow.documentId);
        if (
          workflow.status === WorkflowStatus.CHANGES_REQUESTED &&
          workflow.initiatedById === actorId
        ) {
          changesRequestedByActorDocuments.add(workflow.documentId);
        }
      }
      if (!terminalStatuses.includes(workflow.status)) {
        activeReviewDocuments.add(workflow.documentId);
      }
    }
    const pendingApprovalDocuments = new Set<number>(
      approvals.map((approval) => approval.workflow.documentId),
    );
    const grantsByDocument = new Map<number, { canEdit: boolean; canDelete: boolean; canView: boolean }>();
    for (const grant of directGrants) {
      const previous = grantsByDocument.get(grant.documentId);
      grantsByDocument.set(grant.documentId, {
        canEdit: previous?.canEdit === true || grant.canEdit === true,
        canDelete: previous?.canDelete === true || grant.canDelete === true,
        canView: previous?.canView === true || grant.canView === true,
      });
    }

    for (const document of documents) {
      const reception =
        document.receptionOriginDirectoryId != null ||
        document.directory?.receptionEnabled === true;
      let receptionLiveSubmit = false;
      let receptionReadable = false;
      const receptionDirectoryId = receptionDirectoryByDocument.get(document.id);
      if (actorId && receptionDirectoryId != null) {
        const directory = directoryById.get(receptionDirectoryId);
        if (directory?.receptionEnabled) {
          const receptionCapabilities = resolveReceptionCapabilities({
            ownerId: directory.createdById,
            userId: actorId,
            directParticipant:
              directParticipantByDirectory.get(receptionDirectoryId) ?? null,
            roleParticipants:
              roleParticipantsByDirectory.get(receptionDirectoryId) ?? [],
            delegate: delegateByDirectory.get(receptionDirectoryId) ?? null,
          });
          receptionLiveSubmit = receptionCapabilities.submit;
          receptionReadable = receptionCapabilities.readAll ||
            (receptionCapabilities.submit &&
              (document.uploadedById === actorId || receptionCapabilities.peerRead));
        }
      }
      result.set(
        document.id,
        { canRequestChanges: Boolean(actorId && (document.uploadedById === actorId || effectiveAdminRoute) &&
            !reception && !document.deletedAt && !document.archivedAt && !activeBlockingDocuments.has(document.id)),
          sharingProvenance: reception ? [] : ordinaryAccess.get(document.id)?.provenance ?? [],
          sharingSummary: reception ? undefined : ordinaryAccess.get(document.id)?.sharingSummary,
          actionCapabilities: resolveDocumentActionCapabilities({
          uploadedById: document.uploadedById,
          actor,
          reception,
          deleted: document.deletedAt != null,
          archived: document.archivedAt != null,
          activeBlockingWorkflow: activeBlockingDocuments.has(document.id),
          changesRequestedByActor: changesRequestedByActorDocuments.has(document.id),
          hasPendingApproval: pendingApprovalDocuments.has(document.id),
          manageSharing: reception ? false : ordinaryAccess.get(document.id)?.capabilities.canShare === true,
          canEditMetadata: ordinaryAccess.get(document.id)?.capabilities.canEdit === true,
          canUploadVersion: ordinaryAccess.get(document.id)?.capabilities.canUploadVersion === true,
          receptionLiveSubmit,
          receptionActiveReview: activeReviewDocuments.has(document.id),
        }),
          batchCapabilities: resolveBatchActionCapabilities({
            actorId,
            uploadedById: document.uploadedById,
            reception,
            canEdit: grantsByDocument.get(document.id)?.canEdit === true,
            canDelete: grantsByDocument.get(document.id)?.canDelete === true,
            canView: grantsByDocument.get(document.id)?.canView === true,
            receptionLiveSubmit,
            receptionReadable,
            workflowEditable: !activeBlockingDocuments.has(document.id) || changesRequestedByActorDocuments.has(document.id),
            receptionActiveReview: activeReviewDocuments.has(document.id),
          }),
        },
      );
    }
    return result;
  }

  async canEditDocument(
    document: { id: number; uploadedById: string },
    userId: string,
    userRole: UserRole,
    // Cliente transaccional opcional: permite revalidar la autoridad dentro de
    // la misma transacción del llamador sin abandonar su conexión. Los lectores
    // existentes conservan el comportamiento raíz por defecto.
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    const current = await db.document.findUnique({ where: { id: document.id } });
    if (!current || current.deletedAt) return false;
    let reception: boolean;
    try {
      reception = await this.directoryService.assertDocumentMutation(db, current, userId, 'edit');
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) return false;
      throw error;
    }
    userRole = UserRole.USER;
    const workflow = await db.documentWorkflow.findFirst({
      where: {
        documentId: document.id,
        active: true,
        status: {
          in: [
            WorkflowStatus.PENDING,
            WorkflowStatus.IN_PROGRESS,
            WorkflowStatus.CHANGES_REQUESTED,
          ],
        },
      },
      select: { status: true, initiatedById: true },
    });
    if (
      workflow &&
      !(
        workflow.status === WorkflowStatus.CHANGES_REQUESTED &&
        workflow.initiatedById === userId
      )
    ) {
      return false;
    }

    try {
      if (reception || (await requireResourceAccess(db, current, userId, 'document', 'canUploadVersion'))) return true;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }

    const hasPendingApproval = await db.workflowApproval.findFirst({
      where: {
        workflow: {
          documentId: document.id,
          status: { in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING] },
        },
        userId,
        action: null,
      },
    });
    return Boolean(hasPendingApproval);
  }

  async update(
    id: number,
    updateDocumentDto: UpdateDocumentDto,
    userId: string,
    userRole: UserRole,
  ) {
    const document = await this.findOne(id, userId, userRole);
    if (await this.preflightMutation(id, userId, 'edit')) userRole = UserRole.USER;
    if (updateDocumentDto.isPublic !== undefined && updateDocumentDto.isPublic !== document.isPublic) {
      await assertSharingDocumentAvailable(this.prisma, document);
      const manager = await this.prisma.user.findUnique({ where: { id: userId }, select: sharingManagerSelect });
      assertSharingManager(document, manager);
    }
    await this.assertWorkflowEditable(id, userId, userRole);

    // La autorización de metadatos ya se verificó y se repetirá bajo bloqueo.

    const academicData = updateDocumentDto.academic;
    const templateData = updateDocumentDto.templateData;
    const name = updateDocumentDto.name?.trim();
    if (updateDocumentDto.name !== undefined && !name) {
      throw new BadRequestException('El nombre del documento no puede estar vacío');
    }
    const documentNumber = updateDocumentDto.documentNumber === undefined
      ? undefined
      : updateDocumentDto.documentNumber?.trim() || null;
    const classification = await this.resolveUpdateClassification(
      document,
      updateDocumentDto,
    );

    const updatedDocument = await this.withDocumentMutation(id, userId, 'edit', async (tx, locked, reception) => {
    if (locked.deletedAt) throw new NotFoundException('Documento no disponible');
    await this.assertWorkflowEditable(id, userId, reception ? UserRole.USER : userRole, tx);
    if (documentNumber !== undefined && documentNumber !== null) {
      const existing = await tx.document.findFirst({
        where: { documentNumber, id: { not: id } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('El número institucional ya está en uso');
    }
    // Solo una visibilidad realmente modificada se persiste; un eco sin cambios
    // no debe escribir isPublic ni competir con un cambio público concurrente.
    const visibilityChanged =
      updateDocumentDto.isPublic !== undefined && updateDocumentDto.isPublic !== locked.isPublic;
    if (visibilityChanged) {
      await assertSharingDocumentAvailable(tx, locked);
      const manager = await tx.user.findUnique({ where: { id: userId }, select: sharingManagerSelect });
      assertSharingManager(locked, manager);
    }
    const persisted = await tx.document.update({
      where: { id },
      data: {
        description: updateDocumentDto.description,
        ...(name !== undefined ? { name } : {}),
        ...(documentNumber !== undefined ? { documentNumber } : {}),
        documentTypeId: classification.documentTypeId,
        ...(classification.categoryId !== undefined
          ? { categoryId: classification.categoryId }
          : {}),
        ...(visibilityChanged && { isPublic: updateDocumentDto.isPublic }),
        ...(academicData
          ? {
              academic: {
                upsert: {
                  create: {
                    courseId: academicData.courseId,
                    subjectId: academicData.subjectId,
                    academicYearId: academicData.academicYearId,
                  },
                  update: {
                    courseId: academicData.courseId,
                    subjectId: academicData.subjectId,
                    academicYearId: academicData.academicYearId,
                  },
                },
              },
            }
          : {}),
        ...(templateData
          ? {
              templateData: {
                upsert: {
                  create: {
                    templateId: templateData.templateId,
                    formData: templateData.formData,
                    batchId: templateData.batchId,
                  },
                  update: {
                    templateId: templateData.templateId,
                    formData: templateData.formData,
                    batchId: templateData.batchId,
                  },
                },
              },
            }
          : {}),

      },
      include: {
        academic: true,
        search: true,
        templateData: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
            batch: { select: { id: true, name: true } },
          },
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
          },
        },
        documentType: {
          select: { id: true, name: true },
        },
      },
    });
    await this.appendLifecycleAudit(
      {
        action: AuditAction.UPDATE,
        documentId: id,
        metadata: {
          before: this.documentAuditSnapshot(locked),
          after: this.documentAuditSnapshot(persisted),
        },
      },
      tx,
    );
    return persisted;

    }).catch((error: unknown) => {
      const databaseError = error as { code?: string; meta?: { target?: unknown } };
      if (databaseError?.code === 'P2002' && String(databaseError.meta?.target).includes('documentNumber')) {
        throw new ConflictException('El número institucional ya está en uso');
      }
      throw error;
    });
    await this.recordDocumentAccess(id, userId, 'UPDATE');

    return updatedDocument;
  }

  async move(
    id: number,
    directoryId: number | { directoryId: number | null },
    userId: string,
    userRole: UserRole,
  ) {
    const rawDestination =
      typeof directoryId === 'object' ? directoryId.directoryId : directoryId;
    const destination = rawDestination === null ? null : Number(rawDestination);
    if (destination !== null && !Number.isInteger(destination)) {
      throw new BadRequestException(
        'El directorio destino debe ser un entero o null',
      );
    }
    await this.findOne(id, userId, userRole);
    try {
      const movedDocument = await this.directoryService.submissionTransaction(async db => {
        await db.$queryRaw(Prisma.sql`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`);
        const document = await db.document.findUnique({ where: { id } });
        if (!document || document.deletedAt || document.archivedAt) throw new NotFoundException('Documento no encontrado');
        const reception = await this.directoryService.assertDocumentMutation(db, document, userId, 'withdraw');
        if (!reception) await requireResourceAccess(db, document, userId, 'document', 'canEdit');
        const origin = await this.directoryService.prepareSubmission(db, destination, { id: userId, role: userRole }, document);
        const moved = await db.document.update({ where: { id }, data: {
          directoryId: destination,
          ...(origin != null ? { receptionOriginDirectoryId: origin, isPublic: false } : {}),
        } });
        await this.directoryService.recordSubmission(db, document, origin);
        await this.appendLifecycleAudit(
          {
            action: AuditAction.UPDATE,
            documentId: id,
            metadata: {
              before: { directoryId: document.directoryId ?? null },
              after: { directoryId: moved.directoryId ?? null },
            },
          },
          db,
        );
        return moved;
      });
      await this.recordDocumentAccess(id, userId, 'UPDATE');
      return movedDocument;
    } catch (error) {
      if ((error as any)?.code === 'P2003')
        throw new ConflictException('El directorio destino ya no existe');
      throw error;
    }
  }

  async remove(id: number, userId: string, userRole: UserRole) {
    await this.findOne(id, userId, userRole);
    await this.preflightMutation(id, userId, 'withdraw');
    const source = await this.withDocumentMutation(id, userId, 'withdraw', async (tx, document, _reception, rollback) => {
      if (document.deletedAt || !document.versions[0]) throw new NotFoundException('Documento no disponible');
       if (document.uploadedById !== userId)
        throw new ForbiddenException('No tienes permiso para eliminar este documento');
      const version = document.versions[0];
      // Copiar primero conserva los originales y permite compensar un fallo de BD.
      const trashPath = resolve('uploads', 'trash', `${randomUUID()}${extname(version.storedName)}`);
      this.assertIndependentPath(trashPath, version.path);
      rollback(() => this.storage.deleteFile(trashPath));
      this.storage.copyFile(version.path, trashPath);
      await tx.document.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId } });
      await tx.documentVersion.update({ where: { id: version.id }, data: { path: trashPath } });
      await tx.documentAccess.create({ data: { documentId: id, userId, action: 'DELETE' } });
      await this.appendLifecycleAudit(
        {
          action: AuditAction.DELETE,
          documentId: id,
          metadata: { movedToTrash: true, version: version.version },
        },
        tx,
      );
      return document.versions.some(item => item.id !== version.id && item.path === version.path) ? null : version.path;
    });
    this.cleanupCommittedSource(source);
    return { message: 'Documento movido a papelera exitosamente' };
  }

  /**
   * Restaurar documento desde la papelera
   */
  async restore(id: number, userId: string, userRole: UserRole) {
    await this.preflightMutation(id, userId, 'withdraw');
    const source = await this.withDocumentMutation(id, userId, 'withdraw', async (tx, document, _reception, rollback) => {
      if (!document.deletedAt) throw new BadRequestException('El documento no está eliminado');
      if (document.uploadedById !== userId)
        throw new ForbiddenException('No tienes permiso para restaurar este documento');
      const source = this.copyLifecycleVersion(document, rollback);
      await tx.document.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
      await tx.documentVersion.update({ where: { id: document.versions[0].id }, data: { path: source.destination } });
      await this.appendLifecycleAudit(
        { action: AuditAction.RESTORE, documentId: id, metadata: { restoredFromTrash: true } },
        tx,
      );
      return source.cleanup;
    });
    this.cleanupCommittedSource(source);
    return { message: 'Documento restaurado exitosamente' };
  }

  /**
   * Eliminar permanentemente un documento
   */
  async permanentDelete(id: number, userId: string, userRole: UserRole) {
    await this.preflightMutation(id, userId, 'withdraw');
    const paths = await this.withDocumentMutation(id, userId, 'withdraw', async (tx, document, reception) => {
      if (document.uploadedById !== userId)
        throw new ForbiddenException('Solo el propietario puede eliminar permanentemente documentos');
      await tx.document.delete({ where: { id } });
      await this.appendLifecycleAudit(
        { action: AuditAction.DELETE, documentId: id, metadata: { permanent: true } },
        tx,
      );
      return [...new Set(document.versions.map(version => version.path))];
    });
    // Nunca borrar archivos de una eliminación que no llegó a confirmarse.
    for (const path of paths) this.cleanupCommittedSource(path);
    try { this.thumbnailService.deleteThumbnail(id); }
    catch { this.logger.error('No se pudo eliminar la miniatura del documento eliminado'); }
    return { message: 'Documento eliminado permanentemente' };
  }

  async download(id: number, userId: string, userRole: UserRole) {
    return this.getFileForAccess(id, userId, userRole, 'DOWNLOAD');
  }

  async view(id: number, userId: string, userRole: UserRole) {
    return this.getFileForAccess(id, userId, userRole, 'VIEW');
  }

  private async getFileForAccess(
    id: number,
    userId: string,
    userRole: UserRole,
    action: 'VIEW' | 'DOWNLOAD',
  ) {
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

    await this.recordDocumentAccess(id, userId, action);
    // Best-effort: the audit trail cannot block an already authorized view or
    // download.
    await this.recordLifecycleAudit({ action, documentId: id });

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
    userRole: UserRole,
    comment?: string,
  ) {
    const document = await this.findOne(id, userId, userRole);
    if (await this.preflightMutation(id, userId, 'version')) userRole = UserRole.USER;
    await this.assertWorkflowEditable(id, userId, userRole);

    // Verificar permiso: dueño, admin, o participante con aprobación pendiente en workflow activo
    if (!(await this.canEditDocument(document, userId, userRole))) {
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

    const result = await this.withVersionTransition(id, userId, userRole, async (tx, lockedDocument, rollback) => {
    const newVersion = lockedDocument.currentVersion + 1;
    const newFilename = `${randomUUID()}${extname(file.originalname)}`;
    const newStorageLocation = this.storage.generateStructuredPath(
      lockedDocument.uploadedById,
      lockedDocument.categoryId,
      newFilename,
    );

    // Copiar, no mover: incluso una entrada que ya esté referenciada debe sobrevivir.
    this.assertIndependentPath(newStorageLocation.path, lockedDocument.versions[0].path, file.path);
    rollback(() => this.storage.deleteFile(newStorageLocation.path));
    this.storage.copyFile(file.path, newStorageLocation.path);

    // 4. Calcular checksum del nuevo archivo
    const newChecksum = await this.storage.calculateFileHash(
      newStorageLocation.path,
    );

    // La versión saliente conserva su ruta original e inmutable.
    const extractedText = await this.extractCurrentText(
      newStorageLocation.path,
      file.mimetype,
    );

    // 6. Actualizar documento en la misma transacción que la nueva versión.
    const updatedDocument = await tx.document.update({
      where: { id },
      data: {
        checksumSHA256: newChecksum,
        currentVersion: newVersion,
        search: { upsert: { create: { extractedText }, update: { extractedText } } },
      },
      include: {
        academic: true,
        search: true,
        templateData: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
            batch: { select: { id: true, name: true } },
          },
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
          },
        },
      },
    });

    // 8. Detectar workflow activo para el origen.
    const activeWorkflowForSource =
      await tx.documentWorkflow.findFirst({
        where: {
          documentId: id,
          active: true,
          status: WorkflowStatus.CHANGES_REQUESTED,
        },
        select: { id: true },
      });

    // 8. Crear registro de nueva versión.
    const createdVersion = await tx.documentVersion.create({
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

    if (activeWorkflowForSource && createdVersion?.id) {
      await tx.documentWorkflow.update({
        where: { id: activeWorkflowForSource.id },
        data: { documentVersionId: createdVersion.id },
      });
    }

    // 9. Registrar auditoría.
    await tx.documentAccess.create({
      data: {
        documentId: id,
        userId: userId,
        action: 'UPDATE',
      },
    });
    await this.appendLifecycleAudit(
      {
        action: AuditAction.UPDATE,
        documentId: id,
        metadata: {
          source: createdVersion.source,
          version: createdVersion.version,
          filename: createdVersion.filename,
          mimetype: createdVersion.mimetype,
          size: createdVersion.size,
        },
      },
      tx,
    );

    return { ...updatedDocument, versions: [createdVersion] };
    });
    this.thumbnailService.regenerateThumbnail(result.versions[0].path, id, file.mimetype).catch(() => {});
    this.enqueueOcr(id, result.currentVersion, result.search?.extractedText ?? null, result.versions[0]);
    this.pageCountService?.record(result.versions[0]).catch(() => {});
    return result;
  }

  /**
   * Guarda el contenido del editor básico en un archivo independiente.
   * Las versiones anteriores conservan sus bytes y rutas originales.
   */
  async saveTextContent(
    id: number,
    content: string,
    userId: string,
    userRole: UserRole,
  ) {
    const document = await this.findOne(id, userId, userRole);
    if (await this.preflightMutation(id, userId, 'version')) userRole = UserRole.USER;
    await this.assertWorkflowEditable(id, userId, userRole);

    // Verificar permiso: dueño, admin, rector, vicerrector o participante con aprobación pendiente en workflow activo
    const canEdit = await this.canEditDocument(document, userId, userRole);

    if (!canEdit) {
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
          'No tienes permiso para editar este documento',
        );
      }
    }

    const result = await this.withVersionTransition(id, userId, userRole, async (tx, lockedDocument, rollback) => {
    const currentVersion = lockedDocument.versions[0];
    if (!this.isTextEditable(currentVersion.mimetype)) {
      throw new BadRequestException(
        'Este tipo de archivo no se puede editar con el editor básico',
      );
    }

    const newFilename = `${randomUUID()}${extname(currentVersion.storedName)}`;
    const newLocation = this.storage.generateStructuredPath(
      lockedDocument.uploadedById, lockedDocument.categoryId, newFilename,
    );
    this.assertIndependentPath(newLocation.path, currentVersion.path);
    rollback(() => this.storage.deleteFile(newLocation.path));
    fs.writeFileSync(newLocation.path, Buffer.from(content, 'utf-8'), { flag: 'wx' });

    const newChecksum = await this.storage.calculateFileHash(newLocation.path);
    const newVersion = lockedDocument.currentVersion + 1;
    const extractedText = await this.extractCurrentText(
      newLocation.path,
      currentVersion.mimetype,
    );

    // 3. Actualizar documento en la misma transacción que la nueva versión.
    const updatedDocument = await tx.document.update({
      where: { id },
      data: {
        checksumSHA256: newChecksum,
        currentVersion: newVersion,
        search: { upsert: { create: { extractedText }, update: { extractedText } } },
      },
      include: {
        academic: true,
        search: true,
        templateData: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
            batch: { select: { id: true, name: true } },
          },
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
          },
        },
        documentType: {
          select: { id: true, name: true },
        },
      },
    });

    // 4. Registrar la ruta independiente de la nueva versión.
    const activeWorkflowForSource =
      await tx.documentWorkflow.findFirst({
        where: {
          documentId: id,
          active: true,
          status: WorkflowStatus.CHANGES_REQUESTED,
        },
        select: { id: true },
      });
    const createdVersion = await tx.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        filename: currentVersion.filename,
        mimetype: currentVersion.mimetype,
        storedName: newFilename,
        path: newLocation.path,
        size: Buffer.byteLength(content, 'utf-8'),
        checksumSHA256: newChecksum,
        comment: 'Editado con editor básico',
        createdById: userId,
        source: activeWorkflowForSource
          ? 'CAMBIOS_SOLICITADOS'
          : 'REEMPLAZO_MANUAL',
        workflowId: activeWorkflowForSource?.id ?? null,
      },
    });

    if (activeWorkflowForSource && createdVersion?.id) {
      await tx.documentWorkflow.update({
        where: { id: activeWorkflowForSource.id },
        data: { documentVersionId: createdVersion.id },
      });
    }

    // 6. Registrar auditoría.
    await tx.documentAccess.create({
      data: {
        documentId: id,
        userId: userId,
        action: 'UPDATE',
      },
    });
    await this.appendLifecycleAudit(
      {
        action: AuditAction.UPDATE,
        documentId: id,
        metadata: {
          source: 'EDITOR_BASICO',
          version: createdVersion.version,
          filename: createdVersion.filename,
          mimetype: createdVersion.mimetype,
          size: createdVersion.size,
        },
      },
      tx,
    );

    return { ...updatedDocument, versions: [createdVersion] };
    });
    this.thumbnailService.regenerateThumbnail(result.versions[0].path, id, result.versions[0].mimetype).catch(() => {});
    // El editor básico solo escribe formatos de texto, que no tienen páginas
    // medibles: no se registra ningún recuento para esta versión.
    return result;
  }

  private assertIndependentPath(destination: string, ...sources: string[]) {
    if (sources.some((source) => resolve(source) === resolve(destination)) || fs.existsSync(destination)) {
      throw new ConflictException('La ruta de destino ya está en uso');
    }
  }

  private copyLifecycleVersion(
    document: Prisma.DocumentGetPayload<{ include: { versions: true } }>,
    rollback: (undo: () => void) => void,
  ) {
    const version = document.versions[0];
    if (!version) throw new NotFoundException('Versión del documento no encontrada');
    const destination = this.storage.generateStructuredPath(document.uploadedById, document.categoryId,
      `${randomUUID()}${extname(version.storedName)}`).path;
    this.assertIndependentPath(destination, version.path);
    rollback(() => this.storage.deleteFile(destination));
    this.storage.copyFile(version.path, destination);
    return { destination, cleanup: document.versions.some(item => item.id !== version.id && item.path === version.path) ? null : version.path };
  }

  private cleanupCommittedSource(path: string | null) {
    if (!path) return;
    try { this.storage.deleteFile(path); }
    catch { this.logger.error('No se pudo limpiar el archivo no referenciado después de confirmar la operación'); }
  }

  private async preflightMutation(documentId: number, userId: string, operation: 'edit' | 'version' | 'withdraw') {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    return this.assertMutationAccess(this.prisma, document, userId, operation);
  }

  private async assertMutationAccess(db: any, document: any, userId: string, operation: 'edit' | 'version' | 'withdraw') {
    const reception = await this.directoryService.assertDocumentMutation(db, document, userId, operation === 'withdraw' ? 'withdraw' : 'edit');
    if (reception) return true;
    if (operation === 'withdraw') {
      const actor = userId ? await db.user.findUnique({ where: { id: userId }, select: { id: true } }) : null;
      if (!actor || document.uploadedById !== userId) throw new ForbiddenException('Solo el propietario puede eliminar o restaurar este documento');
    } else {
      try { await requireResourceAccess(db, document, userId, 'document', operation === 'version' ? 'canUploadVersion' : 'canEdit'); }
      catch (error) {
        if (!(error instanceof ForbiddenException) || operation !== 'version') throw error;
        const approval = await db.workflowApproval.findFirst({ where: { userId, action: null,
          workflow: { documentId: document.id, active: true, status: { in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS] } },
        } });
        if (!approval) throw error;
      }
    }
    return false;
  }

  private async withDocumentMutation<T>(
    documentId: number,
    userId: string,
    operation: 'edit' | 'version' | 'withdraw',
    write: (tx: Prisma.TransactionClient,
      document: Prisma.DocumentGetPayload<{ include: { versions: true; directory: { select: { receptionEnabled: true } } } }>,
      reception: boolean, rollback: (undo: () => void) => void) => Promise<T>,
  ): Promise<T> {
    const undo: Array<() => void> = [];
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
        const document = await tx.document.findUnique({ where: { id: documentId },
          include: { versions: { orderBy: { version: 'desc' } }, directory: { select: { receptionEnabled: true } } },
        });
        if (!document) throw new NotFoundException('Documento no encontrado');
        const reception = await this.assertMutationAccess(tx, document, userId, operation);
        return write(tx, document, reception, action => undo.push(action));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      for (const action of undo.reverse()) {
        try { action(); } catch { this.logger.error('No se pudo compensar el archivo de una operación fallida'); }
      }
      if ((error as { code?: string })?.code === 'P2034') throw new ConflictException('La autorización cambió durante la operación. Vuelve a intentarlo');
      throw error;
    }
  }

  private async withVersionTransition<T>(
    documentId: number,
    userId: string,
    userRole: UserRole,
    operation: (
      tx: Prisma.TransactionClient,
      document: Prisma.DocumentGetPayload<{ include: { versions: true } }>,
      rollback: (undo: () => void) => void,
    ) => Promise<T>,
  ): Promise<T> {
    return this.withDocumentMutation(documentId, userId, 'version', async (tx, document, reception, rollback) => {
      if (document.deletedAt || !document.versions[0]) {
        throw new NotFoundException('Documento o versión actual no encontrado');
      }
      await this.assertWorkflowEditable(documentId, userId, reception ? UserRole.USER : userRole, tx);
      // La versión saliente se fecha bajo el mismo bloqueo que el guardado.
      await this.supersedePrincipal(tx, document.versions[0].id);
      return operation(tx, document, rollback);
    });
  }

  private supersedePrincipal(tx: Prisma.TransactionClient, versionId: number) {
    return tx.documentVersion.update({ where: { id: versionId }, data: { supersededAt: new Date() } });
  }

  // Solo integración interna: vuelve a comprobar autoridad y solicitud dentro
  // de la transacción del llamador; no existe ruta HTTP para este método.
  async promoteChangeRequestCorrection(tx: Prisma.TransactionClient, requestId: number, actorId: string,
    rollback: (undo: () => void) => void) {
    const snapshot = await tx.documentChangeRequest.findUnique({ where: { id: requestId } });
    if (!snapshot) throw new NotFoundException('Solicitud no encontrada');
    await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${snapshot.documentId} FOR UPDATE`;
    const request = await tx.documentChangeRequest.findUnique({ where: { id: requestId } });
    if (!request || request.documentId !== snapshot.documentId) throw new ConflictException('La solicitud cambió');
    const document = await tx.document.findUnique({ where: { id: request.documentId }, include: {
      versions: { orderBy: { version: 'desc' }, take: 1 }, directory: { select: { receptionEnabled: true } },
    } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: changeRequestActorSelect });
    assertChangeRequestManager(document, actor);
    await assertChangeRequestDocument(tx, document);
    if (request.status !== 'CORRECTION_SUBMITTED' || !request.stagedPath || !request.filename || !request.mimetype || !request.size) {
      throw new ConflictException('No hay una corrección pendiente de aceptar');
    }
    if (document.versions[0]?.id !== request.baseVersionId || document.versions[0].version !== document.currentVersion) {
      throw new ConflictException('La versión principal cambió');
    }
    // Validar el área privada antes de copiar: nunca aceptar rutas estáticas arbitrarias.
    this.storage.readPrivateCorrection(request.stagedPath);
    const storedName = `${randomUUID()}${extname(request.filename)}`;
    const destination = this.storage.generateStructuredPath(document.uploadedById, document.categoryId, storedName).path;
    this.assertIndependentPath(destination, document.versions[0].path, request.stagedPath);
    rollback(() => this.storage.deleteFile(destination));
    this.storage.copyFile(request.stagedPath, destination);
    const checksumSHA256 = await this.storage.calculateFileHash(destination);
    const extractedText = await this.extractCurrentText(destination, request.mimetype);
    await this.supersedePrincipal(tx, document.versions[0].id);
    const version = await tx.documentVersion.create({ data: {
      documentId: document.id, version: document.currentVersion + 1, filename: request.filename,
      mimetype: request.mimetype, storedName, path: destination, size: request.size, checksumSHA256,
      comment: `Corrección aceptada de la solicitud ${request.id}`, createdById: request.recipientId,
      source: 'REEMPLAZO_MANUAL', workflowId: null,
    } });
    await tx.document.update({ where: { id: document.id }, data: {
      currentVersion: version.version, checksumSHA256,
      search: { upsert: { create: { extractedText }, update: { extractedText } } },
    } });
    await tx.documentAccess.create({ data: { documentId: document.id, userId: actorId, action: 'UPDATE' } });
    await this.appendLifecycleAudit({ action: AuditAction.UPDATE, documentId: document.id,
      metadata: { changeRequestId: request.id, source: version.source, version: version.version, filename: version.filename } }, tx);
    return version;
  }

  // Metadatos derivados se generan solo después de confirmar la promoción.
  refreshAcceptedCorrection(version: any) {
    this.thumbnailService.regenerateThumbnail(version.path, version.documentId, version.mimetype).catch(() => {});
    this.enqueueOcr(version.documentId, version.version, null, version);
    this.pageCountService?.record(version).catch(() => {});
  }

  /**
   * Determina si un mimetype es editable como texto plano por el editor básico
   */
  private isTextEditable(mimetype: string): boolean {
    const normalizedMimetype = mimetype.toLowerCase();
    if (normalizedMimetype.startsWith('text/')) return true;
    const editableMimetypes = [
      'application/json',
      'application/xml',
      'application/javascript',
      'application/csv',
    ];
    return editableMimetypes.includes(normalizedMimetype);
  }

  private async assertWorkflowEditable(
    id: number,
    userId: string,
    userRole: UserRole,
    prisma: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await assertWorkflowEditablePolicy(prisma, id, userId, UserRole.USER);
  }

  /**
   * Obtener todas las versiones de un documento
   */
  async getVersions(id: number, userId: string, userRole: UserRole) {
    const document = await this.findOne(id, userId, userRole);

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
      include: {
        ...retentionEvidenceInclude,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
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

    const days = await this.settingsService.getVersionRetentionDays();
    let canManageRetention = Boolean(userId) && !document.deletedAt &&
      document.uploadedById === userId;
    if (canManageRetention) {
      try { await this.preflightMutation(id, userId, 'edit'); }
      catch (error) {
        if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) throw error;
        canManageRetention = false;
      }
    }
    return versions.map((version) => this.versionRetentionResponse(version, document, days, canManageRetention));
  }

  private versionRetentionResponse<T extends Parameters<typeof getVersionRetention>[0]>(
    version: T,
    document: Parameters<typeof getVersionRetention>[1],
    days: number,
    canManageRetention: boolean,
  ) {
    const { expiresAt, isRetentionProtected } = getVersionRetention(version, document, days);
    return { ...version, expiresAt, isRetentionProtected, canManageRetention };
  }

  async updateVersionRetention(
    id: number,
    versionNumber: number,
    dto: UpdateVersionRetentionDto,
    userId: string,
    userRole: UserRole,
  ) {
    if (!userId) throw new ForbiddenException('Debes iniciar sesión para conservar una versión');
    const document = await this.findOne(id, userId, userRole);
    await this.preflightMutation(id, userId, 'edit');
    if (document.uploadedById !== userId) {
      throw new ForbiddenException('Solo el propietario puede conservar versiones');
    }
    const days = await this.settingsService.getVersionRetentionDays();
    return this.withDocumentMutation(id, userId, 'edit', async (tx, locked) => {
      if (locked.deletedAt) throw new NotFoundException('Documento no disponible');
      if (locked.uploadedById !== userId) {
        throw new ForbiddenException('Solo el propietario puede conservar versiones');
      }
      // Revalidar la fecha al adquirir el bloqueo, no únicamente antes de esperar.
      const data = retentionOverride(dto);
      const version = await tx.documentVersion.findUnique({
        where: { documentId_version: { documentId: id, version: versionNumber } },
        include: retentionEvidenceInclude,
      });
      if (!version) throw new NotFoundException('Versión no encontrada');
      const updated = await tx.documentVersion.update({
        where: { id: version.id }, data, include: retentionEvidenceInclude,
      });
      await tx.documentAccess.create({ data: { documentId: id, userId, action: 'UPDATE' } });
      return this.versionRetentionResponse(updated, locked, days, true);
    });
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
    if (await this.preflightMutation(documentId, userId, 'version')) userRole = UserRole.USER;
    await this.assertWorkflowEditable(documentId, userId, userRole);

    // Solo el dueño o admin pueden restaurar versiones
    if (!(await this.canEditDocument(document, userId, userRole))) {
      throw new ForbiddenException(
        'No tienes permiso para restaurar versiones de este documento',
      );
    }

    // Fix 1: Bloquear restauración si hay workflow activo
    const activeWorkflow = await this.prisma.documentWorkflow.findFirst({
      where: {
        documentId,
        active: true,
        status: {
          in: [
            WorkflowStatus.IN_PROGRESS,
            WorkflowStatus.PENDING,
            WorkflowStatus.CHANGES_REQUESTED,
          ],
        },
      },
      select: { currentState: true },
    });
    if (activeWorkflow) {
      throw new ConflictException(
        `No se puede restaurar una versión mientras el documento tiene un workflow activo` +
          ` (etapa: "${activeWorkflow.currentState}"). Cancela el workflow primero.`,
      );
    }

    let committedVersion: { id: number; checksumSHA256: string | null; path: string; mimetype: string } | undefined;
    let committedText: string | null = null;
    let committedCurrentVersion = 0;
    const result = await this.withVersionTransition(documentId, userId, userRole, async (tx, lockedDocument, rollback) => {
    const workflow = await tx.documentWorkflow.findFirst({
      where: { documentId, active: true, status: { in: [WorkflowStatus.IN_PROGRESS, WorkflowStatus.PENDING, WorkflowStatus.CHANGES_REQUESTED] } },
      select: { id: true },
    });
    if (workflow) throw new ConflictException('No se puede restaurar una versión mientras el documento tiene un workflow activo');
    // Buscar la versión solicitada bajo el bloqueo del documento.
    const version = await tx.documentVersion.findUnique({
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

    // La versión actual y la seleccionada mantienen sus rutas originales.
    const currentVersion = lockedDocument.currentVersion + 1;

    // 2. Copiar archivo de la versión solicitada a ubicación principal
    const newFilename = `${randomUUID()}${extname(version.storedName)}`;
    const newLocation = this.storage.generateStructuredPath(
      lockedDocument.uploadedById,
      lockedDocument.categoryId,
      newFilename,
    );

    this.assertIndependentPath(newLocation.path, version.path, lockedDocument.versions[0].path);
    rollback(() => this.storage.deleteFile(newLocation.path));
    this.storage.copyFile(version.path, newLocation.path);

    const extractedText = await this.extractCurrentText(
      newLocation.path,
      version.mimetype,
    );

    // 4. Actualizar documento en la misma transacción que la versión restaurada.
    const updatedDocument = await tx.document.update({
      where: { id: documentId },
      data: {
        checksumSHA256: version.checksumSHA256,
        currentVersion,
        search: { upsert: { create: { extractedText }, update: { extractedText } } },
      },
    });

    // 5. Crear registro de versión restaurada.
    committedVersion = await tx.documentVersion.create({
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
        // La versión restaurada reutiliza los bytes de la versión elegida, por
        // lo que su recuento de páginas es el mismo.
        pageCount: version.pageCount,
      },
    });
    committedText = extractedText;
    committedCurrentVersion = currentVersion;
    await this.appendLifecycleAudit(
      {
        action: AuditAction.RESTORE,
        resource: AuditResource.DOCUMENT_VERSION,
        resourceId: String(committedVersion.id),
        documentId,
        metadata: {
          restoredFromVersion: versionNumber,
          version: currentVersion,
          filename: version.filename,
          mimetype: version.mimetype,
          size: version.size,
        },
      },
      tx,
    );

    return updatedDocument;
    });
    this.enqueueOcr(documentId, committedCurrentVersion, committedText, committedVersion);
    return result;
  }

  private async requireAggregateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new ForbiddenException('Usuario no encontrado');
    return { id: user.id, role: user.role as UserRole };
  }

  async getStats(userId: string, userRole: UserRole) {
    const user = await this.requireAggregateUser(userId);
    const where: any = { deletedAt: null }; // Excluir eliminados
    const quarantinedDocumentIds = await this.quarantinedDocumentIds();
    if (quarantinedDocumentIds.length) {
      where.id = { notIn: quarantinedDocumentIds };
    }

    where.AND = [buildDocumentAccessFilter(user)];

    const [totalDocuments, totalSizeAgg] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.documentVersion.aggregate({
        where: {
          document: where,
        },
        _sum: { size: true },
      }),
    ]);

    const totalSize = totalSizeAgg._sum.size ?? 0;

    return {
      totalDocuments,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    };
  }

  /**
   * Returns the bounded, authorization-safe data used by the dashboard tray.
   * Pending work deliberately means visible active DRAFT documents only; the
   * existing detail/editor routes remain the final action authorization boundary.
   */
  async getDashboardSummary(userId: string, userRole: UserRole, limit = 5) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
      throw new BadRequestException(
        'El límite del resumen debe estar entre 1 y 5',
      );
    }

    const user = await this.requireAggregateUser(userId);
    const accessFilter = buildDocumentAccessFilter(user);
    const quarantinedDocumentIds = await this.quarantinedDocumentIds();

    const activeScope: any[] = [
      { deletedAt: null },
      { archivedAt: null },
      ...(quarantinedDocumentIds.length
        ? [{ id: { notIn: quarantinedDocumentIds } }]
        : []),
      ...(accessFilter ? [accessFilter] : []),
    ];
    const pendingWhere = {
      AND: [
        ...activeScope,
        { workflow: { some: { active: true, status: WorkflowStatus.DRAFT } } },
      ],
    };
    const recentWhere = { AND: activeScope };
    const rowQuery: any = {
      take: limit + 1,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        description: true,
        documentNumber: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
        category: {
          select: { id: true, name: true, color: true, icon: true },
        },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            filename: true,
            mimetype: true,
            size: true,
          },
        },
        workflow: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, currentState: true },
        },
      },
    };

    const [pendingCount, pendingRows, recentRows] = await Promise.all([
      this.prisma.document.count({ where: pendingWhere }),
      this.prisma.document.findMany({ where: pendingWhere, ...rowQuery }),
      this.prisma.document.findMany({ where: recentWhere, ...rowQuery }),
    ]);

    return {
      pendingOfficializationCount: pendingCount,
      pendingOfficialization: pendingRows.slice(0, limit),
      pendingHasMore: pendingRows.length > limit,
      recent: recentRows.slice(0, limit),
      recentHasMore: recentRows.length > limit,
      generatedAt: new Date().toISOString(),
    };
  }

  async getCategories(userId: string, userRole: UserRole) {
    const user = await this.requireAggregateUser(userId);
    const where: any = { deletedAt: null }; // Excluir eliminados

    where.AND = [buildDocumentAccessFilter(user)];

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
    userRole: UserRole,
    startDate?: Date,
    endDate?: Date,
    categoryId?: number,
  ) {
    const user = await this.requireAggregateUser(userId);
    const where: any = {
      AND: [{ deletedAt: null }],
    };

    // La recepción usa autorización vigente; el calendario ordinario no cambia.
    where.AND.push(buildDocumentAccessFilter(user));

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

    const documents = await this.prisma.document.findMany({
      where,
      include: {
        academic: true,
        search: true,
        templateData: {
          include: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
            batch: { select: { id: true, name: true } },
          },
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
    userRole: UserRole,
  ) {
    const { search, categoryId, page = 1, limit = 50 } = query;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role as unknown as UserRole,
        })
      : { id: -1 };

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
            include: {
              template: {
                select: {
                  id: true,
                  name: true,
                  documentType: { select: { id: true, name: true } },
                },
              },
              batch: { select: { id: true, name: true } },
            },
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
  async getArchiveStats(userId: string, userRole: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role as unknown as UserRole,
        })
      : { id: -1 };

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
  async restoreFromArchive(id: number, userId: string, userRole: UserRole) {
    await this.preflightMutation(id, userId, 'withdraw');
    const source = await this.withDocumentMutation(id, userId, 'withdraw', async (tx, document, _reception, rollback) => {
      if (!document.versions[0]) throw new NotFoundException('Versión del documento no encontrada');
      if (!document.versions[0].path.replace(/\\\\/g, '/').includes('/archive/'))
        throw new BadRequestException('El documento no está archivado');
       if (document.uploadedById !== userId)
        throw new ForbiddenException('No tienes permiso para restaurar este documento');
      const source = this.copyLifecycleVersion(document, rollback);
      await tx.document.update({ where: { id }, data: { archivedAt: null } });
      await tx.documentVersion.update({ where: { id: document.versions[0].id }, data: { path: source.destination } });
      await this.appendLifecycleAudit(
        { action: AuditAction.RESTORE, documentId: id, metadata: { restoredFromArchive: true } },
        tx,
      );
      return source.cleanup;
    });
    this.cleanupCommittedSource(source);
    return { message: 'Documento restaurado al archivo activo exitosamente' };
  }

  // Un fallo de extracción conserva los metadatos sin exponer contenido en logs.
  private async extractCurrentText(
    filePath: string,
    mimetype: string,
  ): Promise<string | null> {
    try {
      return await this.textExtractionService.extractFromFile(filePath, mimetype);
    } catch {
      return null;
    }
  }

  /**
   * Encola OCR SOLO tras confirmar el commit de la versión actual.
   * Best-effort: nunca espera OCR ni altera la respuesta ya persistida.
   */
  private enqueueOcr(
    documentId: number,
    currentVersion: number,
    digitalText: string | null,
    version: { id: number; checksumSHA256: string | null; path: string; mimetype: string } | undefined,
  ): void {
    if (!version?.checksumSHA256) return;
    try {
      this.pdfOcrService.enqueue({
        documentId,
        currentVersion,
        versionRowId: version.id,
        checksumSHA256: version.checksumSHA256,
        path: version.path,
        mimetype: version.mimetype,
        digitalText,
      });
    } catch {
      this.logger.warn('No se pudo encolar el enriquecimiento OCR; se conserva el texto digital.');
    }
  }

  private async recordDocumentAccess(
    documentId: number,
    userId: string,
    action: 'VIEW' | 'DOWNLOAD' | 'UPDATE',
  ): Promise<void> {
    await this.prisma.documentAccess.create({
      data: { documentId, userId, action },
    });
  }

  /**
   * Explicit snapshot of the auditable document fields. The whitelist keeps
   * storage paths, file bytes, and signed URLs out of the audit trail even if
   * the Prisma row grows.
   */
  private documentAuditSnapshot(document: Record<string, any>) {
    return {
      description: document.description ?? null,
      categoryId: document.categoryId ?? null,
      documentTypeId: document.documentTypeId ?? null,
      isPublic: document.isPublic ?? false,
      directoryId: document.directoryId ?? null,
    };
  }

  /**
   * Appends an audit event inside an already open transaction so the event
   * commits (or rolls back) together with the mutation it describes.
   * AuditService sanitizes the metadata.
   */
  private async appendLifecycleAudit(
    input: {
      action: AuditAction;
      documentId: number;
      resource?: AuditResource;
      resourceId?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    db: AuditWriter,
  ): Promise<void> {
    if (!this.auditService) return;
    await this.auditService.record(
      {
        action: input.action,
        resource: input.resource ?? AuditResource.DOCUMENT,
        resourceId: input.resourceId ?? String(input.documentId),
        documentId: input.documentId,
        metadata: input.metadata ?? null,
      },
      db,
    );
  }

  /**
   * Best-effort event over the root connection: used for reads and for
   * lifecycle paths already committed by another service. A failed audit write
   * never alters the access decision or the committed result.
   */
  async recordLifecycleAudit(input: {
    action: AuditAction;
    documentId: number;
    resource?: AuditResource;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void> {
    if (!Number.isSafeInteger(input.documentId)) return;
    try {
      await this.appendLifecycleAudit(input, this.prisma);
    } catch {
      this.logger.warn(
        `No se pudo registrar el evento de auditoría ${input.action} del documento ${input.documentId}`,
      );
    }
  }

  /**
   * Paginated audit trail of one document. It reuses the current document
   * visibility and never delegates the filter to the caller: the path
   * `documentId` always wins, and reading the trail does not emit a VIEW event.
   */
  async getAuditTrail(
    id: number,
    query: AuditLogQueryDto,
    userId: string,
    userRole: UserRole,
  ): Promise<AuditLogPage> {
    const document = await this.findOne(id, userId, userRole);
    if (document.uploadedById !== userId && userRole !== UserRole.ADMIN && userRole !== UserRole.RECTOR) {
      throw new ForbiddenException('No tienes permiso para consultar la actividad de este documento');
    }
    return this.auditService.query({ ...query, documentId: id });
  }

  private async quarantinedDocumentIds(): Promise<number[]> {
    const candidateStore = (this.prisma as any).workflowResidueCandidate;
    if (!candidateStore?.findMany) return [];
    const candidates = await candidateStore.findMany({
      where: { rootType: 'DOCUMENT', state: 'QUARANTINED' },
      select: { rootId: true },
    });
    const rootIds = (candidates ?? []).map((candidate) =>
      Number(candidate.rootId),
    ) as number[];
    return Array.from(new Set<number>(rootIds));
  }
}
