import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  AuthoringAction,
  AuthoringStatus,
  ContentVersionReason,
  TemplateVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentGeneratorService } from '../document-template/document-generator.service';
import { DocumentNumberingService } from '../document/document-numbering.service';
import { AuthoringRendererService } from './authoring-renderer.service';
import { AuthoringTemplateService } from './authoring-template.service';
import {
  applyDefaults,
  cloneJson,
  normalizeFields,
  validateAndPrepareForm,
} from './authoring-fields';
import {
  CreateAuthoringBatchDto,
  CreateAuthoringDocumentDto,
  ReturnAuthoringDocumentDto,
  ReviewAuthoringDocumentDto,
  SaveAuthoringDraftDto,
  SubmitAuthoringDocumentDto,
} from './dto/authoring.dto';

interface AuthoringUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

const DOCUMENT_INCLUDE = {
  authoring: true,
  templateData: {
    include: {
      template: { include: { category: true } },
      templateVersion: { include: { template: true } },
    },
  },
  uploadedBy: { select: { id: true, name: true, email: true, role: true } },
  category: { select: { id: true, name: true } },
  documentType: { select: { id: true, name: true } },
  versions: { orderBy: { version: 'desc' as const } },
  contentVersions: { orderBy: { version: 'desc' as const } },
};

@Injectable()
export class AuthoringDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: AuthoringTemplateService,
    private readonly renderer: AuthoringRendererService,
    private readonly generator: DocumentGeneratorService,
    private readonly numbering: DocumentNumberingService,
  ) {}

  private async findDocument(id: number) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      include: DOCUMENT_INCLUDE,
    });
    if (!document?.authoring) {
      throw new NotFoundException('Documento de elaboración no encontrado');
    }
    return document;
  }

  private fieldsFor(document: any) {
    const raw =
      document.templateData?.templateVersion?.fields ??
      document.templateData?.template?.fields ??
      { fields: [] };
    return normalizeFields(raw).fields;
  }

  private formDataOf(document: any): Record<string, any> {
    const value = document.templateData?.formData;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return {};
  }

  private versionFor(document: any) {
    const version = document.templateData?.templateVersion;
    if (!version) {
      throw new BadRequestException('El documento no tiene una versión de plantilla');
    }
    return version;
  }

  private assertMutable(document: any) {
    const authoring = document.authoring;
    if (
      authoring.status === AuthoringStatus.EMITTED ||
      authoring.status === AuthoringStatus.ARCHIVED ||
      authoring.emittedAt
    ) {
      throw new ForbiddenException(
        'El documento ya fue emitido y no puede modificarse',
      );
    }
  }

  private async activeAcademicYear() {
    return this.prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
      select: { name: true },
    });
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'documento';
  }

  private async saveBuffer(buffer: Buffer) {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const storedName = `${randomUUID()}.pdf`;
    const filePath = await this.generator.saveDocumentToFile(
      buffer,
      storedName,
      uploadsDir,
    );
    return { storedName, filePath };
  }

  private async buildRendered(
    version: any,
    prepared: Record<string, any>,
    user: AuthoringUser,
    options: { draft: boolean; documentNumber?: string | null },
  ) {
    const template = { ...version, template: version.template };
    const htmlSnapshot = await this.renderer.renderHtml(
      template,
      prepared,
      user,
      options,
    );
    const buffer = await this.renderer.generatePdf(
      template,
      prepared,
      user,
      options,
    );
    return { htmlSnapshot, buffer };
  }

  private async savePdfVersion(
    document: any,
    version: any,
    buffer: Buffer,
    user: AuthoringUser,
    comment: string,
  ) {
    const { storedName, filePath } = await this.saveBuffer(buffer);
    const previous = document.versions[0];
    const nextVersion = (document.currentVersion ?? previous?.version ?? 0) + 1;
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const filename = `${this.slug(version.template?.name ?? 'documento')}-v${nextVersion}.pdf`;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (previous) {
          await tx.documentVersion.update({
            where: { id: previous.id },
            data: { supersededAt: new Date() },
          });
        }
        const created = await tx.documentVersion.create({
          data: {
            documentId: document.id,
            version: nextVersion,
            filename,
            storedName,
            mimetype: 'application/pdf',
            size: buffer.length,
            path: filePath,
            checksumSHA256: checksum,
            comment,
            createdById: user.id,
            source: 'REEMPLAZO_MANUAL',
          },
        });
        await tx.document.update({
          where: { id: document.id },
          data: { currentVersion: nextVersion, checksumSHA256: checksum },
        });
        return created;
      });
    } catch (error) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // El archivo pudo no haberse creado; no ocultar el error original.
      }
      throw error;
    }
  }

  private async nextContentVersion(documentId: number) {
    const aggregate = await this.prisma.documentContentVersion.aggregate({
      where: { documentId },
      _max: { version: true },
    });
    return (aggregate._max.version ?? 0) + 1;
  }

  private async createContentVersion(
    documentId: number,
    formData: Record<string, any>,
    htmlSnapshot: string,
    reason: ContentVersionReason,
    user: AuthoringUser,
    tx?: any,
  ) {
    const db = tx ?? this.prisma;
    const aggregate = await db.documentContentVersion.aggregate({
      where: { documentId },
      _max: { version: true },
    });
    const version = (aggregate._max.version ?? 0) + 1;
    return db.documentContentVersion.create({
      data: {
        documentId,
        version,
        formData,
        htmlSnapshot,
        reason,
        createdById: user.id,
        createdByName: user.name ?? null,
      },
    });
  }

  private async createEvent(
    authoringId: number,
    action: AuthoringAction,
    fromStatus: AuthoringStatus | null,
    toStatus: AuthoringStatus,
    user: AuthoringUser,
    observation?: string | null,
    tx?: any,
  ) {
    const db = tx ?? this.prisma;
    return db.documentAuthoringEvent.create({
      data: {
        authoringId,
        action,
        fromStatus,
        toStatus,
        observation: observation ?? null,
        actorId: user.id,
        actorName: user.name ?? null,
      },
    });
  }

  async createDraft(dto: CreateAuthoringDocumentDto, user: AuthoringUser) {
    const version = await this.templates.getVersion(dto.templateVersionId);
    if (version.status !== TemplateVersionStatus.PUBLISHED) {
      throw new BadRequestException('La plantilla no tiene una versión publicada');
    }

    const fields = normalizeFields(version.fields).fields;
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(fields, dto.formData ?? {}, user, activeYear);
    const prepared = validateAndPrepareForm(fields, raw, false);
    const { buffer, htmlSnapshot } = await this.buildRendered(
      version,
      prepared,
      user,
      { draft: true },
    );
    const { storedName, filePath } = await this.saveBuffer(buffer);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const filename = `${this.slug(version.template.name)}-borrador.pdf`;

    try {
      const document = await this.prisma.document.create({
        data: {
          name: `${version.template.name} - ${new Date().toISOString().slice(0, 10)}`,
          description: `Borrador de ${version.template.name}`,
          uploadedById: user.id,
          categoryId: version.template.categoryId,
          documentTypeId: version.template.documentTypeId,
          isPublic: false,
          checksumSHA256: checksum,
          versions: {
            create: {
              version: 1,
              filename,
              storedName,
              mimetype: 'application/pdf',
              size: buffer.length,
              path: filePath,
              checksumSHA256: checksum,
              createdById: user.id,
              source: 'UPLOAD_INICIAL',
              comment: 'Borrador inicial',
            },
          },
          templateData: {
            create: {
              templateId: version.templateId,
              templateVersionId: version.id,
              formData: raw,
            },
          },
          authoring: {
            create: {
              templateVersionId: version.id,
              status: AuthoringStatus.DRAFT,
              events: {
                create: {
                  action: AuthoringAction.CREATED,
                  toStatus: AuthoringStatus.DRAFT,
                  actorId: user.id,
                  actorName: user.name ?? null,
                },
              },
            },
          },
        },
        include: DOCUMENT_INCLUDE,
      });

      await this.createContentVersion(
        document.id,
        raw,
        htmlSnapshot,
        ContentVersionReason.DRAFT_SAVE,
        user,
      );
      return this.findDocument(document.id);
    } catch (error) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // El archivo pudo no haberse creado.
      }
      throw error;
    }
  }

  async saveDraft(
    id: number,
    dto: SaveAuthoringDraftDto,
    user: AuthoringUser,
  ) {
    const document = await this.findDocument(id);
    this.assertMutable(document);
    const fields = this.fieldsFor(document);
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(fields, dto.formData, user, activeYear);
    const prepared = validateAndPrepareForm(fields, raw, false);

    await this.prisma.documentTemplateData.update({
      where: { documentId: id },
      data: { formData: raw },
    });

    if (dto.createVersion) {
      const version = this.versionFor(document);
      const htmlSnapshot = await this.renderer.renderHtml(
        { ...version, template: version.template },
        prepared,
        document.uploadedBy,
        { draft: true, documentNumber: document.documentNumber },
      );
      await this.createContentVersion(
        id,
        raw,
        htmlSnapshot,
        ContentVersionReason.DRAFT_SAVE,
        user,
      );
    }

    await this.createEvent(
      document.authoring.id,
      AuthoringAction.SAVED,
      document.authoring.status,
      document.authoring.status,
      user,
    );

    return this.findDocument(id);
  }

  async submit(
    id: number,
    dto: SubmitAuthoringDocumentDto,
    user: AuthoringUser,
  ) {
    const document = await this.findDocument(id);
    this.assertMutable(document);
    if (
      document.authoring.status !== AuthoringStatus.DRAFT &&
      document.authoring.status !== AuthoringStatus.CHANGES_REQUESTED
    ) {
      throw new BadRequestException('El documento no está en un estado editable');
    }

    const fields = this.fieldsFor(document);
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(
      fields,
      this.formDataOf(document),
      document.uploadedBy,
      activeYear,
    );
    const prepared = validateAndPrepareForm(fields, raw, true);
    const version = this.versionFor(document);
    const { buffer, htmlSnapshot } = await this.buildRendered(
      version,
      prepared,
      document.uploadedBy,
      { draft: true, documentNumber: document.documentNumber },
    );

    let reviewerName: string | null = dto.reviewerName ?? null;
    if (dto.reviewerId) {
      const reviewer = await this.prisma.user.findFirst({
        where: { id: dto.reviewerId, isActive: true },
        select: { id: true, name: true },
      });
      if (!reviewer) throw new BadRequestException('Revisor no encontrado');
      reviewerName = reviewer.name;
    }

    await this.savePdfVersion(document, version, buffer, user, 'Enviado a revisión');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.documentTemplateData.update({
        where: { documentId: id },
        data: { formData: raw },
      });
      const authoring = await tx.documentAuthoring.update({
        where: { documentId: id },
        data: {
          status: AuthoringStatus.IN_REVIEW,
          reviewerId: dto.reviewerId ?? null,
          reviewerName,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          reviewedByName: null,
          reviewObservation: null,
        },
      });
      await this.createContentVersion(
        id,
        raw,
        htmlSnapshot,
        ContentVersionReason.SENT_TO_REVIEW,
        user,
        tx,
      );
      await this.createEvent(
        authoring.id,
        AuthoringAction.SUBMITTED,
        document.authoring.status,
        AuthoringStatus.IN_REVIEW,
        user,
        reviewerName,
        tx,
      );
      return authoring;
    });

    return this.findDocument(updated.documentId);
  }

  async approve(
    id: number,
    dto: ReviewAuthoringDocumentDto,
    user: AuthoringUser,
  ) {
    const document = await this.findDocument(id);
    if (document.authoring.status !== AuthoringStatus.IN_REVIEW) {
      throw new BadRequestException('El documento no está en revisión');
    }

    const fields = this.fieldsFor(document);
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(
      fields,
      this.formDataOf(document),
      document.uploadedBy,
      activeYear,
    );
    const prepared = validateAndPrepareForm(fields, raw, false);
    const version = this.versionFor(document);
    const htmlSnapshot = await this.renderer.renderHtml(
      { ...version, template: version.template },
      prepared,
      document.uploadedBy,
      { draft: true, documentNumber: document.documentNumber },
    );

    await this.prisma.$transaction(async (tx) => {
      const authoring = await tx.documentAuthoring.update({
        where: { documentId: id },
        data: {
          status: AuthoringStatus.APPROVED,
          reviewedAt: new Date(),
          reviewedById: user.id,
          reviewedByName: user.name ?? null,
          reviewObservation: dto.observation ?? null,
        },
      });
      await this.createContentVersion(
        id,
        raw,
        htmlSnapshot,
        ContentVersionReason.APPROVED,
        user,
        tx,
      );
      await this.createEvent(
        authoring.id,
        AuthoringAction.APPROVED,
        AuthoringStatus.IN_REVIEW,
        AuthoringStatus.APPROVED,
        user,
        dto.observation ?? null,
        tx,
      );
    });

    return this.findDocument(id);
  }

  async returnDocument(
    id: number,
    dto: ReturnAuthoringDocumentDto,
    user: AuthoringUser,
  ) {
    const document = await this.findDocument(id);
    if (document.authoring.status !== AuthoringStatus.IN_REVIEW) {
      throw new BadRequestException('El documento no está en revisión');
    }
    if (!dto.observation?.trim()) {
      throw new BadRequestException('La observación es obligatoria');
    }

    const fields = this.fieldsFor(document);
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(
      fields,
      this.formDataOf(document),
      document.uploadedBy,
      activeYear,
    );
    const prepared = validateAndPrepareForm(fields, raw, false);
    const version = this.versionFor(document);
    const htmlSnapshot = await this.renderer.renderHtml(
      { ...version, template: version.template },
      prepared,
      document.uploadedBy,
      { draft: true, documentNumber: document.documentNumber },
    );

    await this.prisma.$transaction(async (tx) => {
      const authoring = await tx.documentAuthoring.update({
        where: { documentId: id },
        data: {
          status: AuthoringStatus.CHANGES_REQUESTED,
          reviewedAt: new Date(),
          reviewedById: user.id,
          reviewedByName: user.name ?? null,
          reviewObservation: dto.observation.trim(),
        },
      });
      await this.createContentVersion(
        id,
        raw,
        htmlSnapshot,
        ContentVersionReason.RETURNED,
        user,
        tx,
      );
      await this.createEvent(
        authoring.id,
        AuthoringAction.RETURNED,
        AuthoringStatus.IN_REVIEW,
        AuthoringStatus.CHANGES_REQUESTED,
        user,
        dto.observation.trim(),
        tx,
      );
    });

    return this.findDocument(id);
  }

  async emit(id: number, user: AuthoringUser) {
    const document = await this.findDocument(id);
    if (document.authoring.status === AuthoringStatus.EMITTED) {
      return document;
    }
    if (
      document.authoring.status !== AuthoringStatus.DRAFT &&
      document.authoring.status !== AuthoringStatus.APPROVED
    ) {
      throw new BadRequestException(
        'El documento debe estar en borrador o aprobado para emitirse',
      );
    }

    const fields = this.fieldsFor(document);
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(
      fields,
      this.formDataOf(document),
      document.uploadedBy,
      activeYear,
    );
    const prepared = validateAndPrepareForm(fields, raw, true);
    const version = this.versionFor(document);
    const number = await this.numbering.assignNumber(
      document.id,
      document.categoryId,
      version.numberPrefix,
    );
    const { buffer, htmlSnapshot } = await this.buildRendered(
      version,
      prepared,
      document.uploadedBy,
      { draft: false, documentNumber: number },
    );

    await this.savePdfVersion(document, version, buffer, user, 'Emisión final');

    await this.prisma.$transaction(async (tx) => {
      await tx.documentTemplateData.update({
        where: { documentId: id },
        data: { formData: raw },
      });
      const authoring = await tx.documentAuthoring.update({
        where: { documentId: id },
        data: {
          status: AuthoringStatus.EMITTED,
          emittedAt: new Date(),
          emittedById: user.id,
          emittedByName: user.name ?? null,
        },
      });
      await this.createContentVersion(
        id,
        raw,
        htmlSnapshot,
        ContentVersionReason.EMITTED,
        user,
        tx,
      );
      await this.createEvent(
        authoring.id,
        AuthoringAction.EMITTED,
        document.authoring.status,
        AuthoringStatus.EMITTED,
        user,
        number,
        tx,
      );
      await tx.document.update({
        where: { id },
        data: { documentNumber: number },
      });
    });

    return this.findDocument(id);
  }

  async archive(id: number, user: AuthoringUser) {
    const document = await this.findDocument(id);
    if (document.authoring.status !== AuthoringStatus.EMITTED) {
      throw new BadRequestException('Solo se puede archivar un documento emitido');
    }

    await this.prisma.$transaction(async (tx) => {
      const authoring = await tx.documentAuthoring.update({
        where: { documentId: id },
        data: { status: AuthoringStatus.ARCHIVED },
      });
      await tx.document.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.createEvent(
        authoring.id,
        AuthoringAction.ARCHIVED,
        AuthoringStatus.EMITTED,
        AuthoringStatus.ARCHIVED,
        user,
        null,
        tx,
      );
    });

    return this.findDocument(id);
  }

  async list(query: {
    status?: string;
    search?: string;
    page?: number | string;
    limit?: number | string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = {
      deletedAt: null,
      authoring: query.status
        ? { is: { status: query.status as AuthoringStatus } }
        : { isNot: null },
    };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: DOCUMENT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async pending() {
    return this.prisma.document.findMany({
      where: {
        deletedAt: null,
        authoring: { is: { status: AuthoringStatus.IN_REVIEW } },
      },
      include: DOCUMENT_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(id: number) {
    return this.findDocument(id);
  }

  async preview(id: number, user: AuthoringUser) {
    const document = await this.findDocument(id);
    const fields = this.fieldsFor(document);
    const activeYear = await this.activeAcademicYear();
    const raw = applyDefaults(
      fields,
      this.formDataOf(document),
      document.uploadedBy,
      activeYear,
    );
    const prepared = validateAndPrepareForm(fields, raw, false);
    const version = this.versionFor(document);
    const draft = document.authoring.status !== AuthoringStatus.EMITTED;
    const buffer = await this.renderer.generatePdf(
      { ...version, template: version.template },
      prepared,
      document.uploadedBy,
      { draft, documentNumber: document.documentNumber },
    );
    return {
      buffer,
      filename: `${this.slug(version.template?.name ?? 'documento')}-${draft ? 'borrador' : 'emitido'}.pdf`,
    };
  }

  async download(id: number) {
    const document = await this.findDocument(id);
    const current = document.versions[0];
    if (!current) throw new NotFoundException('El documento no tiene archivo');
    return {
      buffer: fs.readFileSync(current.path),
      filename: current.filename,
    };
  }

  async batch(dto: CreateAuthoringBatchDto, user: AuthoringUser) {
    const version = await this.templates.getVersion(dto.templateVersionId);
    if (version.status !== TemplateVersionStatus.PUBLISHED) {
      throw new BadRequestException('La plantilla no tiene una versión publicada');
    }

    const documents: any[] = [];
    const errors: string[] = [];
    for (let index = 0; index < dto.recipients.length; index += 1) {
      const recipient = dto.recipients[index];
      try {
        const merged = this.deepMerge(
          cloneJson(dto.commonFormData ?? {}) ?? {},
          recipient.formData ?? {},
        );
        const document = await this.createDraft(
          { templateVersionId: dto.templateVersionId, formData: merged },
          user,
        );
        documents.push(document);
      } catch (error: any) {
        errors.push(`Fila ${index + 1}: ${error?.message ?? 'Error desconocido'}`);
      }
    }

    if (documents.length === 0) {
      throw new BadRequestException(
        `No se pudo generar ningún documento. ${errors.join('; ')}`,
      );
    }

    return { documents, errors };
  }

  async listUsers() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  private deepMerge(base: any, override: any): any {
    if (Array.isArray(base) || Array.isArray(override)) {
      return cloneJson(override ?? base);
    }
    if (
      base &&
      override &&
      typeof base === 'object' &&
      typeof override === 'object'
    ) {
      const result = { ...base };
      for (const key of Object.keys(override)) {
        result[key] = this.deepMerge(base[key], override[key]);
      }
      return result;
    }
    return cloneJson(override ?? base);
  }
}
