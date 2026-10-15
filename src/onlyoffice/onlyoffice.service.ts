import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import { join, extname } from 'path';
import { createHash, randomUUID } from 'crypto';
import PizZip from 'pizzip';
import { Prisma } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ThumbnailService } from '../document/thumbnail.service';
import { DocumentPageCountService } from '../document/document-page-count.service';
import { CreateBlankDocumentDto } from './dto/create-blank-document.dto';
import { TextExtractionService } from '../document/text-extraction/text-extraction.service';
import { PdfOcrJob, PdfOcrService } from '../document/text-extraction/pdf-ocr.service';
import { DirectoryService } from '../directory/directory.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { UserRole } from '../auth/role.enum';

// Sesión de edición firmada por el servidor: liga documento, clave, actor y
// permiso de edición al momento de la emisión.
type IssuanceClaims = {
  purpose: 'onlyoffice-editor';
  documentId: number;
  key: string;
  userId: string;
  canEdit: boolean;
};

@Injectable()
export class OnlyofficeService {
  constructor(
    private config: ConfigService,
    private storage: StorageService,
    private prisma: PrismaService,
    private thumbnailService: ThumbnailService,
    private textExtractionService: TextExtractionService,
    private directoryService: DirectoryService,
    private pdfOcrService: PdfOcrService,
    // Metadato derivado del recuento de páginas. La inyección es opcional para
    // que los constructores directos sigan compilando; el módulo siempre lo provee.
    @Optional() private readonly pageCountService?: DocumentPageCountService,
  ) {}

  generateEditorConfig(
    document: {
      id: number;
      title: string;
      fileType: string;
      callbackHost: string;
    },
    user: { id: string; name: string },
    canEdit = false,
  ) {
    const callbackHost = this.config.get('ONLYOFFICE_CALLBACK_HOST');
    const secret = this.config.get('ONLYOFFICE_SECRET');
    // La clave identifica la sesión de edición y debe ser única incluso bajo
    // emisiones concurrentes, por eso no depende solo del reloj.
    const key = `doc_${document.id}_${randomUUID()}`;
    const issuanceToken = this.generateIssuanceToken(
      { documentId: document.id, key, userId: user.id, canEdit },
      secret,
    );

    const config = {
      document: {
        fileType: document.fileType,
        key,
        title: document.title,
        url: `${callbackHost}/api/onlyoffice/file/${document.id}?token=${issuanceToken}`,
        permissions: {
          edit: canEdit,
          download: true,
        },
      },
      editorConfig: {
        callbackUrl: `${callbackHost}/api/onlyoffice/callback/${document.id}?issuance=${issuanceToken}`,
        user: {
          id: user.id,
          name: user.name,
        },
        lang: 'es',
        mode: canEdit ? 'edit' : 'view',
      },
      documentType: this.getDocumentType(document.fileType),
    };

    return config;
  }

  async checkHealth(): Promise<{ available: boolean }> {
    const onlyofficeUrl = this.config.get<string>('ONLYOFFICE_URL');
    if (!onlyofficeUrl?.trim()) {
      return { available: false };
    }

    let healthcheckUrl: string;
    try {
      const parsedUrl = new URL(onlyofficeUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { available: false };
      }
      healthcheckUrl = `${onlyofficeUrl.replace(/\/+$/, '')}/healthcheck`;
    } catch {
      return { available: false };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(healthcheckUrl, {
        signal: controller.signal,
      });
      return { available: response.status === 200 };
    } catch {
      return { available: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  async createBlankDocument(dto: CreateBlankDocumentDto, userId: string) {
    const { title, fileType, categoryId, courseId } = dto;
    // El tipo genérico es la ausencia de tipo concreto: null u omitido.
    const documentType =
      dto.documentTypeId === undefined || dto.documentTypeId === null
        ? null
        : await this.prisma.documentType.findUnique({
            where: { id: dto.documentTypeId },
            select: { id: true, isActive: true, categoryId: true },
          });

    if (
      dto.documentTypeId !== undefined &&
      dto.documentTypeId !== null &&
      !documentType
    ) {
      throw new BadRequestException('El tipo de documento no existe');
    }
    if (documentType && !documentType.isActive) {
      throw new BadRequestException('El tipo de documento está inactivo');
    }
    if (
      documentType &&
      categoryId !== undefined &&
      categoryId !== documentType.categoryId
    ) {
      throw new BadRequestException(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
    }

    const resolvedCategoryId = documentType?.categoryId ?? categoryId ?? null;
    const filename = `${title}.${fileType}`;
    const uniqueFilename = `${randomUUID()}.${fileType}`;
    const mimetype = this.getMimetype(fileType);

    // Build blank content and write to temp
    const content = this.buildBlankContent(fileType);
    const buffer = Buffer.from(content);
    const tempPath = join('./uploads/temp', uniqueFilename);
    fs.writeFileSync(tempPath, buffer);

    // Move to structured storage path
    const storageLocation = this.storage.generateStructuredPath(
      userId,
      resolvedCategoryId,
      uniqueFilename,
    );
    this.storage.moveFile(tempPath, storageLocation.path);

    // Calculate checksum
    const checksum = await this.storage.calculateFileHash(storageLocation.path);

    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
      select: { id: true },
    });

    const extractedText = await this.extractStoredText(storageLocation.path, mimetype);

    // Create document record
    const document = await this.prisma.document.create({
      data: {
        categoryId: resolvedCategoryId,
        documentTypeId: documentType?.id ?? null,
        isPublic: false,
        uploadedById: userId,
        directoryId: null,
        currentVersion: 1,
        search: { create: { extractedText } },
        versions: {
          create: {
            version: 1,
            filename,
            mimetype,
            storedName: uniqueFilename,
            path: storageLocation.path,
            size: buffer.length,
            checksumSHA256: checksum,
            comment: 'Created in editor',
            createdById: userId,
            source: 'UPLOAD_INICIAL',
          },
        },
        ...(courseId !== undefined || currentYear?.id
          ? {
              academic: {
                create: {
                  ...(courseId !== undefined ? { courseId } : {}),
                  ...(currentYear?.id
                    ? { academicYearId: currentYear.id }
                    : {}),
                },
              },
            }
          : {}),
      },
      include: {
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
    });

    // Generate thumbnail in background
    this.thumbnailService
      .regenerateThumbnail(storageLocation.path, document.id, mimetype)
      .catch(() => {});

    return document;
  }

  generateFileToken(documentId: number, secret: string): string {
    if (typeof secret !== 'string' || !secret.trim()) {
      throw new BadRequestException('Configuración de OnlyOffice inválida');
    }

    return jwt.sign({ documentId }, secret.trim(), {
      algorithm: 'HS256',
      expiresIn: 86400,
    });
  }

  verifyFileToken(
    token: unknown,
    documentId: number,
  ): { documentId: number } | null {
    const claims = this.verifyToken(token);
    if (!claims || !Number.isInteger(claims.documentId)) return null;
    // Un token nuevo de emisión nunca se acepta como token heredado, ni siquiera
    // malformado o con propósito ajeno. Solo el token ordinario id-only sigue vivo.
    if (
      Object.prototype.hasOwnProperty.call(claims, 'purpose') ||
      Object.prototype.hasOwnProperty.call(claims, 'key') ||
      Object.prototype.hasOwnProperty.call(claims, 'userId') ||
      Object.prototype.hasOwnProperty.call(claims, 'canEdit')
    )
      return null;
    return claims.documentId === documentId ? { documentId } : null;
  }

  // Firma la sesión de edición completa: documento, clave, actor y permiso.
  generateIssuanceToken(
    payload: {
      documentId: number;
      key: string;
      userId: string;
      canEdit: boolean;
    },
    secret: string,
  ): string {
    if (typeof secret !== 'string' || !secret.trim()) {
      throw new BadRequestException('Configuración de OnlyOffice inválida');
    }

    return jwt.sign(
      {
        purpose: 'onlyoffice-editor',
        documentId: payload.documentId,
        key: payload.key,
        userId: payload.userId,
        canEdit: payload.canEdit,
      },
      secret.trim(),
      { algorithm: 'HS256', expiresIn: 86400 },
    );
  }

  // Verificación separada del callback firmado por Document Server. Exige el
  // propósito de emisión y, si se indica, coincide con el documento de la ruta.
  verifyIssuanceToken(
    token: unknown,
    documentId?: number,
  ): IssuanceClaims | null {
    const claims = this.verifyToken(token);
    if (!claims) return null;
    if (claims.purpose !== 'onlyoffice-editor') return null;
    const documentIdClaim = claims.documentId;
    if (
      typeof documentIdClaim !== 'number' ||
      !Number.isInteger(documentIdClaim)
    )
      return null;
    if (typeof claims.key !== 'string' || !claims.key) return null;
    if (typeof claims.userId !== 'string' || !claims.userId) return null;
    if (typeof claims.canEdit !== 'boolean') return null;
    if (documentId !== undefined && documentIdClaim !== documentId) return null;
    return {
      purpose: 'onlyoffice-editor',
      documentId: documentIdClaim,
      key: claims.key,
      userId: claims.userId,
      canEdit: claims.canEdit,
    };
  }

  // Resuelve el acceso a los bytes del archivo. El token de emisión liga al
  // actor y se revalida contra la política vigente; los tokens heredados solo
  // identifican el documento y fallan cerrados para la recepción.
  async resolveFileAccess(
    documentId: number,
    token: unknown,
  ): Promise<{ version: { path: string; filename: string; mimetype: string } } | null> {
    const issuance = this.verifyIssuanceToken(token, documentId);
    if (issuance) {
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const version = document?.versions?.[0];
      if (!document || !version) return null;
      // La sesión emitida se revalida: actores revocados o eliminados dejan de
      // recibir los bytes aunque el token siga vigente.
      if (!(await this.isLiveReadable(documentId, issuance.userId))) return null;
      return { version: this.toFileVersion(version) };
    }

    // Token heredado: identifica solo el documento. La recepción exige actor y
    // falla cerrada; los documentos ordinarios conservan su compatibilidad.
    if (this.verifyFileToken(token, documentId)) {
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const version = document?.versions?.[0];
      if (!document || !version) return null;
      if (await this.isReceptionDocument(document)) return null;
      return { version: this.toFileVersion(version) };
    }

    return null;
  }

  private toFileVersion(version: {
    path: string;
    filename: string;
    mimetype: string;
  }) {
    return {
      path: version.path,
      filename: version.filename,
      mimetype: version.mimetype,
    };
  }

  // Reaplica el filtro de acceso vigente (recepción con origen durable y
  // concesiones ordinarias) y falla cerrada para actores eliminados.
  private async isLiveReadable(
    documentId: number,
    userId: string,
  ): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return false;
    const allowed = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        ...buildDocumentAccessFilter({
          id: userId,
          role: user.role as unknown as UserRole,
        }),
      },
      select: { id: true },
    });
    return Boolean(allowed);
  }

  // La recepción se clasifica por origen durable primero y por carpeta vigente
  // después. No concede autoridad; solo determina qué política se aplica.
  private async isReceptionDocument(
    document: {
      receptionOriginDirectoryId?: number | null;
      directoryId?: number | null;
    },
    db: any = this.prisma,
  ): Promise<boolean> {
    if (document.receptionOriginDirectoryId != null) return true;
    if (document.directoryId != null) {
      const directory = await db.directory.findUnique({
        where: { id: document.directoryId },
        select: { receptionEnabled: true },
      });
      return Boolean(directory?.receptionEnabled);
    }
    return false;
  }

  // Autoriza una escritura de callback. En recepción exige una sesión emitida
  // que coincida en documento, clave, actor y permiso de edición, y revalida
  // la participación vigente del autor. Los documentos ordinarios conservan su
  // autorización previa.
  private async authorizeCallbackEdit(
    documentId: number,
    actor: unknown,
    key: string,
    issuance: IssuanceClaims | null,
    db: any = this.prisma,
  ): Promise<boolean> {
    if (typeof actor !== 'string' || !actor) return false;
    const document = await db.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
      },
    });
    if (!document) return false;
    if (await this.isReceptionDocument(document, db)) {
      if (!issuance) return false;
      if (issuance.documentId !== documentId) return false;
      if (issuance.key !== key) return false;
      if (issuance.userId !== actor) return false;
      if (issuance.canEdit !== true) return false;
      try {
        return await this.directoryService.assertDocumentMutation(
          db,
          document,
          actor,
          'edit',
        );
      } catch {
        return false;
      }
    }
    return this.isAuthorizedEditor(documentId, actor, db);
  }

  async handleCallback(
    documentId: number,
    body: unknown,
    authorization?: unknown,
    issuanceToken?: unknown,
  ): Promise<{ error: 0 | 1 }> {
    try {
      if (!Number.isInteger(documentId) || !this.isPlainObject(body))
        return { error: 1 };
      const source = body as Record<string, unknown>;
      const token = this.extractToken(source, authorization);
      const claims = this.verifyToken(token);
      if (!claims) return { error: 1 };
      const status = claims.status;
      const key = claims.key;
      if (
        !Number.isInteger(status) ||
        ![1, 2, 3, 4, 6, 7].includes(status as number) ||
        typeof key !== 'string' ||
        !new RegExp(`^doc_${documentId}_[A-Za-z0-9_-]+$`).test(key)
      )
        return { error: 1 };
      if (
        claims.documentId !== undefined &&
        (!Number.isInteger(claims.documentId) ||
          claims.documentId !== documentId)
      )
        return { error: 1 };
      for (const field of ['status', 'key', 'documentId', 'url', 'users']) {
        if (
          Object.prototype.hasOwnProperty.call(source, field) &&
          JSON.stringify(source[field]) !== JSON.stringify(claims[field])
        )
          return { error: 1 };
      }
      if (status !== 2) return { error: 0 };
      if (
        typeof claims.url !== 'string' ||
        !Array.isArray(claims.users) ||
        typeof claims.users[0] !== 'string' ||
        !claims.users[0]
      )
        return { error: 1 };
      const issuance = this.verifyIssuanceToken(issuanceToken);
      if (
        !(await this.authorizeCallbackEdit(
          documentId,
          claims.users[0],
          key,
          issuance,
          this.prisma,
        ))
      )
        return { error: 1 };
      const upstream = this.config.get<string>('ONLYOFFICE_URL');
      const candidate = new URL(claims.url);
      const origin = new URL(upstream);
      if (
        !['http:', 'https:'].includes(candidate.protocol) ||
        candidate.origin !== origin.origin ||
        candidate.username ||
        candidate.password ||
        candidate.hash
      )
        return { error: 1 };
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!document || !document.versions?.[0]) return { error: 1 };
      const response = await fetch(candidate, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return { error: 1 };
      const length = Number(response.headers?.get?.('content-length') || 0);
      if (length > 50 * 1024 * 1024) return { error: 1 };
      const contentType =
        response.headers?.get?.('content-type')?.split(';')[0] ||
        document.versions[0].mimetype;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (
        buffer.length > 50 * 1024 * 1024 ||
        (!buffer.length && !contentType.startsWith('text/'))
      )
        return { error: 1 };
      const latest = document.versions[0];
      const extension = extname(latest.filename || latest.storedName);
      const storedName = `${randomUUID()}${extension}`;
      const tempPath = join(
        this.storage.getPaths().temp,
        `${randomUUID()}${extension}`,
      );
      const location = this.storage.generateStructuredPath(
        document.uploadedById,
        document.categoryId,
        storedName,
      );
      fs.writeFileSync(tempPath, buffer);
      this.storage.moveFile(tempPath, location.path);
      const checksum = createHash('sha256').update(buffer).digest('hex');
      let committedOcr: PdfOcrJob | undefined;
      try {
        const extractedText = await this.extractStoredText(location.path, contentType);
        // La sustitución final comparte una transacción Serializable: el bloqueo
        // de la fila del documento no cubre las membresías, usuarios, roles ni la
        // participación viva que se revalida dentro del mismo ámbito.
        await this.prisma.$transaction(async (tx: any) => {
          const idempotencyKey = createHash('sha256')
            .update(
              JSON.stringify({
                documentId,
                key,
                status,
                url: claims.url,
                users: claims.users,
                actions: claims.actions,
                lastsave: claims.lastsave,
                forcesavetype: claims.forcesavetype,
                userdata: claims.userdata,
              }),
            )
            .digest('hex');
          await tx.onlyofficeCallbackReceipt.create({
            data: { documentId, idempotencyKey },
          });
          await tx.$queryRawUnsafe(
            'SELECT id FROM "Document" WHERE id = $1 FOR UPDATE',
            documentId,
          );
          const locked = await tx.document.findUnique({
            where: { id: documentId },
            include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
          });
          const user = await tx.user.findUnique({
            where: { id: claims.users[0] },
          });
          if (!locked || locked.deletedAt || !locked.versions?.[0] || !user)
            throw new Error('invalid callback identity');
          if (
            !(await this.authorizeCallbackEdit(
              documentId,
              claims.users[0],
              key,
              issuance,
              tx,
            ))
          )
            throw new Error('invalid callback identity');
          // Ligar la nueva versión a la corrección vigente de un workflow del MISMO
          // documento en CHANGES_REQUESTED, bajo el orden de bloqueo Document ->
          // DocumentWorkflow. Se relee el estado final tras el bloqueo para que un
          // workflow terminado o ajeno nunca se revivifique ni se sobrescriba.
          const candidateWorkflow = await tx.documentWorkflow.findFirst({
            where: { documentId, active: true, status: 'CHANGES_REQUESTED' },
            orderBy: { id: 'asc' },
            select: { id: true },
          });
          let correctionWorkflowId: number | null = null;
          if (candidateWorkflow) {
            await tx.$queryRawUnsafe(
              'SELECT id FROM "DocumentWorkflow" WHERE id = $1 FOR UPDATE',
              candidateWorkflow.id,
            );
            const finalWorkflow = await tx.documentWorkflow.findFirst({
              where: {
                id: candidateWorkflow.id,
                documentId,
                active: true,
                status: 'CHANGES_REQUESTED',
              },
              select: { id: true },
            });
            if (finalWorkflow) correctionWorkflowId = finalWorkflow.id;
          }
          // La sustitución y su fecha forman parte de la misma transacción.
          await tx.documentVersion.update({
            where: { id: locked.versions[0].id },
            data: { supersededAt: new Date() },
          });
          const version = locked.versions[0].version + 1;
          const createdVersion = await tx.documentVersion.create({
            data: {
              documentId,
              version,
              filename: locked.versions[0].filename,
              mimetype: locked.versions[0].mimetype,
              storedName,
              path: location.path,
              size: buffer.length,
              checksumSHA256: checksum,
              comment: 'Editado con OnlyOffice',
              createdById: claims.users[0],
              source: correctionWorkflowId
                ? 'CAMBIOS_SOLICITADOS'
                : 'REEMPLAZO_MANUAL',
              workflowId: correctionWorkflowId,
            },
          });
          if (correctionWorkflowId) {
            await tx.documentWorkflow.update({
              where: { id: correctionWorkflowId },
              data: { documentVersionId: createdVersion.id },
            });
          }
          await tx.document.update({
            where: { id: documentId },
            data: {
              currentVersion: version,
              checksumSHA256: checksum,
              search: {
                upsert: {
                  create: { extractedText },
                  update: { extractedText },
                },
              },
            },
          });
          await tx.documentAccess.create({
            data: { documentId, userId: claims.users[0], action: 'UPDATE' },
          });
          committedOcr = {
            documentId,
            currentVersion: version,
            versionRowId: createdVersion.id,
            checksumSHA256: checksum,
            path: location.path,
            mimetype: contentType,
            digitalText: extractedText,
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error: any) {
        this.storage.deleteFile(location.path);
        if (error?.code === 'P2002') return { error: 0 };
        return { error: 1 };
      }
      this.enqueueOcr(committedOcr);
      if (committedOcr)
        this.pageCountService
          ?.record({
            id: committedOcr.versionRowId,
            path: committedOcr.path,
            mimetype: committedOcr.mimetype,
          })
          .catch(() => {});
      return { error: 0 };
    } catch {
      return { error: 1 };
    }
  }

  private async extractStoredText(path: string, mimetype: string): Promise<string | null> {
    try {
      return await this.textExtractionService.extractFromFile(path, mimetype);
    } catch {
      return null;
    }
  }

  /**
   * Encola OCR SOLO tras confirmar el callback; best-effort y sin espera.
   * Nunca altera la respuesta del callback ya confirmado.
   */
  private enqueueOcr(job: PdfOcrJob | undefined): void {
    if (!job?.checksumSHA256) return;
    try {
      this.pdfOcrService.enqueue(job);
    } catch {
      /* El enriquecimiento OCR no altera la respuesta ya confirmada. */
    }
  }

  private async isAuthorizedEditor(
    documentId: number,
    userId: unknown,
    prisma: any = this.prisma,
  ): Promise<boolean> {
    if (typeof userId !== 'string' || !userId) return false;
    const [document, user, workflow] = await Promise.all([
      prisma.document.findUnique({
        where: { id: documentId },
        select: { uploadedById: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      }),
      prisma.documentWorkflow.findFirst({
        where: {
          documentId,
          active: true,
          status: { in: ['PENDING', 'IN_PROGRESS', 'CHANGES_REQUESTED'] },
        },
        select: { status: true, initiatedById: true },
      }),
    ]);
    if (!document || !user) return false;
    if (
      workflow &&
      user.role !== 'ADMIN' &&
      !(workflow.status === 'CHANGES_REQUESTED' && workflow.initiatedById === userId)
    ) return false;
    if (
      user.role === 'ADMIN' ||
      user.role === 'RECTOR' ||
      user.role === 'VICERRECTOR' ||
      document.uploadedById === userId
    ) return true;
    const approval = await prisma.workflowApproval.findFirst({
      where: {
        workflow: {
          documentId,
          status: { in: ['IN_PROGRESS', 'PENDING'] },
        },
        userId,
        action: null,
      },
    });
    return Boolean(approval);
  }

  private extractToken(
    source: Record<string, unknown>,
    authorization: unknown,
  ): string | null {
    let headerToken: string | undefined;
    if (authorization !== undefined) {
      if (typeof authorization !== 'string') return null;
      const match = /^Bearer[ \t]+([^\s]+)$/.exec(authorization);
      if (!match) return null;
      headerToken = match[1];
    }

    let bodyToken: string | undefined;
    if (Object.prototype.hasOwnProperty.call(source, 'token')) {
      if (
        typeof source.token !== 'string' ||
        !source.token ||
        source.token !== source.token.trim() ||
        /\s/.test(source.token)
      )
        return null;
      bodyToken = source.token;
    }

    if (headerToken && bodyToken && headerToken !== bodyToken) return null;
    return headerToken || bodyToken || null;
  }

  private verifyToken(token: unknown): Record<string, unknown> | null {
    try {
      const secret = this.config.get<unknown>('ONLYOFFICE_SECRET');
      if (
        typeof secret !== 'string' ||
        !secret.trim() ||
        typeof token !== 'string'
      )
        return null;

      const verified = jwt.verify(token, secret.trim(), {
        algorithms: ['HS256'],
      });
      if (!this.isPlainObject(verified)) return null;
      if (Object.prototype.hasOwnProperty.call(verified, 'payload')) {
        return this.isPlainObject(verified.payload) ? verified.payload : null;
      }
      return verified;
    } catch {
      return null;
    }
  }

  private isPlainObject(value: unknown): value is Record<string, any> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private getMimetype(fileType: string): string {
    const map: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      md: 'text/markdown',
    };
    return map[fileType] ?? 'application/octet-stream';
  }

  private buildBlankContent(
    fileType: CreateBlankDocumentDto['fileType'],
  ): Buffer {
    if (fileType === 'txt' || fileType === 'md') {
      return Buffer.from('', 'utf-8');
    }
    return this.buildBlankOoxml(fileType);
  }

  private buildBlankOoxml(fileType: 'docx' | 'xlsx' | 'pptx'): Buffer {
    const zip = new PizZip();

    if (fileType === 'docx') {
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
          `</Types>`,
      );
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
          `<w:body><w:p/></w:body>` +
          `</w:document>`,
      );
      zip.file(
        'word/_rels/document.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
      );
    } else if (fileType === 'xlsx') {
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `</Types>`,
      );
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>` +
          `</workbook>`,
      );
      zip.file(
        'xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'xl/worksheets/sheet1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
      );
    } else {
      // pptx
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
          `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
          `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
          `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
          `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
          `</Types>`,
      );
      zip.file(
        '_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/presentation.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
          `<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>` +
          `<p:sldSz cx="9144000" cy="6858000"/>` +
          `<p:notesSz cx="6858000" cy="9144000"/>` +
          `</p:presentation>`,
      );
      zip.file(
        'ppt/_rels/presentation.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
          `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/slides/slide1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:cSld><p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr/>` +
          `</p:spTree></p:cSld>` +
          `</p:sld>`,
      );
      zip.file(
        'ppt/slides/_rels/slide1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/slideLayouts/slideLayout1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank">` +
          `<p:cSld name="Blank"><p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr/>` +
          `</p:spTree></p:cSld>` +
          `</p:sldLayout>`,
      );
      zip.file(
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/slideMasters/slideMaster1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<p:cSld><p:spTree>` +
          `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
          `<p:grpSpPr/>` +
          `</p:spTree></p:cSld>` +
          `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
          `</p:sldMaster>`,
      );
      zip.file(
        'ppt/slideMasters/_rels/slideMaster1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>` +
          `</Relationships>`,
      );
      zip.file(
        'ppt/theme/theme1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">` +
          `<a:themeElements>` +
          `<a:clrScheme name="Office"><a:dk1><a:sysClr lastClr="000000" val="windowText"/></a:dk1><a:lt1><a:sysClr lastClr="FFFFFF" val="window"/></a:lt1>` +
          `<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
          `<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
          `<a:accent3><a:srgbClr val="A9D18E"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
          `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
          `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
          `</a:clrScheme>` +
          `<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
          `<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
          `<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
          `<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
          `<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>` +
          `<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
          `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle>` +
          `<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
          `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
          `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
          `</a:fmtScheme>` +
          `</a:themeElements>` +
          `</a:theme>`,
      );
    }

    return Buffer.from(zip.generate({ type: 'nodebuffer' }));
  }

  private getDocumentType(fileType: string): string {
    const wordTypes = ['doc', 'docx', 'odt', 'txt', 'rtf'];
    const cellTypes = ['xls', 'xlsx', 'ods', 'csv'];
    const slideTypes = ['ppt', 'pptx', 'odp'];
    if (wordTypes.includes(fileType)) return 'word';
    if (cellTypes.includes(fileType)) return 'cell';
    if (slideTypes.includes(fileType)) return 'slide';
    return 'word';
  }
}
