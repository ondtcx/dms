import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { basename } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SettingsService } from '../settings/settings.service';
import { DocumentService } from '../document/document.service';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { UserRole } from '../auth/role.enum';
import { CreateChangeRequestDto, DecideChangeRequestDto } from './document-change-request.dto';
import { assertChangeRequestDocument, assertChangeRequestManager, canManageChangeRequests, changeRequestActorSelect } from './document-change-request.policy';

const activeStatuses = ['PENDING', 'IN_PROGRESS', 'CORRECTION_SUBMITTED'] as const;

@Injectable()
export class DocumentChangeRequestService {
  private readonly logger = new Logger(DocumentChangeRequestService.name);
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService,
    private readonly settings: SettingsService, private readonly documents: DocumentService) {}

  private validate<T extends object>(type: new () => T, input: unknown): T {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Solicitud inválida');
    const dto = plainToInstance(type, input);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) throw new BadRequestException('Solicitud inválida');
    return dto;
  }

  private async context(db: any, id: number, actorId: string) {
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Documento inválido');
    const document = await db.document.findUnique({ where: { id }, include: {
      directory: { select: { receptionEnabled: true } }, versions: { orderBy: { version: 'desc' }, take: 1 },
    } });
    if (!document) throw new NotFoundException('Documento no encontrado');
    const actor = await db.user.findUnique({ where: { id: actorId }, select: changeRequestActorSelect });
    if (!actor || actor.lockedUntil > new Date()) throw new ForbiddenException('Identidad no disponible');
    return { document, actor };
  }

  private readable(db: any, documentId: number, actor: any) {
    return db.document.findFirst({ where: { id: documentId, ...buildDocumentAccessFilter({
      id: actor.id, role: actor.role as UserRole, assignments: (actor.roleAssignments ?? []).map(({ role }) => role),
    }) }, select: { id: true } });
  }

  private safe(request: any) {
    if (!request) return null;
    const { stagedPath, ...response } = request;
    return { ...response, hasCorrection: Boolean(stagedPath) };
  }

  private async write<T>(documentId: number, operation: (tx: Prisma.TransactionClient, rollback: (undo: () => void) => void,
    cleanup: (path: string) => void) => Promise<T>): Promise<T> {
    const undo: Array<() => void> = [];
    const cleanup: string[] = [];
    let result: T;
    try {
      result = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
        return operation(tx, action => undo.push(action), path => { if (path) cleanup.push(path); });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      for (const action of undo.reverse()) {
        try { action(); } catch { this.logger.error('No se pudo compensar una propuesta fallida'); }
      }
      if (['P2002', 'P2034'].includes((error as any)?.code)) throw new ConflictException('La solicitud activa o la autorización cambió. Vuelve a intentarlo');
      throw error;
    }
    for (const path of cleanup) {
      try { this.storage.deleteFile(path); } catch { this.logger.error('No se pudo limpiar una propuesta privada no referenciada'); }
    }
    return result;
  }

  private async notify(db: any, recipientId: string, documentId: number, title: string, message: string, type: 'CHANGES_REQUESTED' | 'DOCUMENT_SHARED' = 'CHANGES_REQUESTED') {
    await db.notification.create({ data: { userId: recipientId, documentId, type, title, message,
      actionUrl: `/dashboard/documents/${documentId}` } });
  }

  async get(documentId: number, actorId: string) {
    const { document, actor } = await this.context(this.prisma, documentId, actorId);
    if (!await this.readable(this.prisma, documentId, actor)) throw new NotFoundException('Documento no encontrado');
    const manager = canManageChangeRequests(document, actor);
    const request = await this.prisma.documentChangeRequest.findFirst({ where: { documentId,
      ...(!manager ? { recipientId: actorId } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    let available = true;
    try { await assertChangeRequestDocument(this.prisma, document); } catch { available = false; }
    return { request: this.safe(request), capabilities: {
      create: available && manager && (!request || !activeStatuses.includes(request.status as any)),
      manage: manager, submit: available && request?.recipientId === actorId && ['PENDING', 'IN_PROGRESS'].includes(request.status),
    } };
  }

  async recipients(documentId: number, actorId: string, query: string) {
    const { document, actor } = await this.context(this.prisma, documentId, actorId);
    assertChangeRequestManager(document, actor);
    await assertChangeRequestDocument(this.prisma, document);
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 100) throw new BadRequestException('Búsqueda inválida');
    return this.prisma.user.findMany({ where: { id: { not: actorId }, AND: [
      { OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
      { OR: [{ name: { contains: query.trim(), mode: 'insensitive' } }, { email: { contains: query.trim(), mode: 'insensitive' } }] },
    ] }, select: { id: true, name: true, email: true }, take: 20, orderBy: { id: 'asc' } });
  }

  async recipientAccess(documentId: number, actorId: string, recipientId: string) {
    const { document, actor } = await this.context(this.prisma, documentId, actorId);
    assertChangeRequestManager(document, actor);
    await assertChangeRequestDocument(this.prisma, document);
    if (typeof recipientId !== 'string' || !recipientId || recipientId.length > 128) throw new BadRequestException('Destinatario inválido');
    const recipient = await this.prisma.user.findUnique({ where: { id: recipientId }, select: changeRequestActorSelect });
    if (!recipient || recipient.lockedUntil > new Date()) throw new BadRequestException('Destinatario no disponible');
    return { hasAccess: Boolean(await this.readable(this.prisma, documentId, recipient)) };
  }

  async create(documentId: number, actorId: string, input: CreateChangeRequestDto) {
    const dto = this.validate(CreateChangeRequestDto, input);
    if (!dto.message.trim() || dto.recipientId.trim() !== dto.recipientId || dto.recipientId === actorId) throw new BadRequestException('Solicitud inválida');
    return this.write(documentId, async tx => {
      const { document, actor } = await this.context(tx, documentId, actorId);
      assertChangeRequestManager(document, actor);
      await assertChangeRequestDocument(tx, document);
      if (await tx.documentChangeRequest.findFirst({ where: { documentId, status: { in: [...activeStatuses] } } })) throw new ConflictException('Ya existe una solicitud activa');
      const current = document.versions[0];
      if (!current || current.version !== document.currentVersion) throw new ConflictException('Versión principal no disponible');
      const recipient = await tx.user.findUnique({ where: { id: dto.recipientId }, select: changeRequestActorSelect });
      if (!recipient || recipient.lockedUntil > new Date()) throw new BadRequestException('Destinatario no disponible');
      if (!await this.readable(tx, documentId, recipient)) {
        if (dto.confirmShare !== true) throw new ConflictException('Debes confirmar compartir acceso de lectura con el destinatario');
        // Las raíces de la vista de acceso pertenecen al propietario. La solicitud
        // conserva al ADMIN que actuó; no se concede delegación ni actualización.
        await tx.accessGrant.create({ data: { documentId, userId: recipient.id,
          grantedById: document.uploadedById, canView: true, canEdit: false, canUploadVersion: false, canShare: false } });
        await this.notify(tx, recipient.id, documentId, 'Documento compartido contigo', 'Se te concedió acceso de lectura para atender una solicitud de cambios.', 'DOCUMENT_SHARED');
      }
      const request = await tx.documentChangeRequest.create({ data: { documentId, requestedById: actorId, recipientId: recipient.id,
        message: dto.message.trim(), status: 'PENDING', baseVersionId: current.id } });
      await this.notify(tx, recipient.id, documentId, 'Solicitud de cambios', dto.message.trim());
      return this.safe(request);
    });
  }

  private async request(db: any, documentId: number, id: number, revision?: number) {
    const request = await db.documentChangeRequest.findUnique({ where: { id } });
    if (!request || request.documentId !== documentId) throw new NotFoundException('Solicitud no encontrada');
    if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0 || request.revision !== revision)) throw new ConflictException('La solicitud cambió. Actualiza la página');
    return request;
  }

  async submit(documentId: number, id: number, actorId: string, revision: number, file: Express.Multer.File) {
    return this.write(documentId, async (tx, rollback) => {
      const { document, actor } = await this.context(tx, documentId, actorId);
      const request = await this.request(tx, documentId, id, revision);
      if (request.recipientId !== actorId) throw new ForbiddenException('Solo el destinatario puede enviar la corrección');
      await assertChangeRequestDocument(tx, document);
      if (!await this.readable(tx, documentId, actor)) throw new ForbiddenException('Ya no tienes acceso al documento');
      if (!['PENDING', 'IN_PROGRESS'].includes(request.status)) throw new ConflictException('La solicitud no admite otra corrección');
      if (document.versions[0]?.id !== request.baseVersionId) throw new ConflictException('La versión principal cambió');
      const filename = basename((file?.originalname ?? '').replace(/\\/g, '/')).replace(/[\x00-\x1f\x7f]/g, '').trim();
      const maxMb = await this.settings.getMaxFileSizeMb();
      const allowed = await this.settings.getAllowedMimeTypes();
      if (!filename || filename.length > 255 || /\.(exe|bat|sh|cmd|com|app|jar|js|php|py|rb)$/i.test(filename) ||
        !file?.buffer || !file.size || file.size !== file.buffer.length || file.size > Math.min(maxMb, 500) * 1024 * 1024 ||
        (allowed.length && !allowed.includes(file.mimetype))) throw new BadRequestException('Archivo o tipo no permitido');
      const path = this.storage.writePrivateCorrection(file.buffer);
      rollback(() => this.storage.deleteFile(path));
      const result = await tx.documentChangeRequest.update({ where: { id }, data: { status: 'CORRECTION_SUBMITTED', revision: { increment: 1 },
        stagedPath: path, filename, mimetype: file.mimetype, size: file.size, submittedAt: new Date() } });
      for (const recipientId of new Set([request.requestedById, document.uploadedById])) {
        await this.notify(tx, recipientId, documentId, 'Corrección pendiente de revisión', filename);
      }
      return this.safe(result);
    });
  }

  async decide(documentId: number, id: number, actorId: string, input: DecideChangeRequestDto) {
    const dto = this.validate(DecideChangeRequestDto, input);
    if (dto.action === 'further' && !dto.message?.trim()) throw new BadRequestException('Describe los cambios adicionales');
    let promoted: any;
    const result = await this.write(documentId, async (tx, rollback, cleanup) => {
      const { document, actor } = await this.context(tx, documentId, actorId);
      assertChangeRequestManager(document, actor);
      const request = await this.request(tx, documentId, id, dto.revision);
      if (!activeStatuses.includes(request.status as any)) throw new ConflictException('La solicitud ya está cerrada');
      if (dto.action !== 'cancel') {
        await assertChangeRequestDocument(tx, document);
        if (request.status !== 'CORRECTION_SUBMITTED') throw new ConflictException('No hay una corrección pendiente');
        if (document.versions[0]?.id !== request.baseVersionId) throw new ConflictException('La versión principal cambió');
      }
      if (dto.action === 'accept') promoted = await this.documents.promoteChangeRequestCorrection(tx, id, actorId, rollback);
      const status = dto.action === 'accept' ? 'ACCEPTED' : dto.action === 'cancel' ? 'CANCELLED' : 'IN_PROGRESS';
      const result = await tx.documentChangeRequest.update({ where: { id }, data: { status, revision: { increment: 1 },
        stagedPath: null, filename: null, mimetype: null, size: null, submittedAt: null,
        ...(dto.action === 'further' ? { message: dto.message.trim() } : { decidedAt: new Date() }) } });
      cleanup(request.stagedPath);
      await this.notify(tx, request.recipientId, documentId,
        dto.action === 'accept' ? 'Corrección aceptada' : dto.action === 'cancel' ? 'Solicitud cancelada' : 'Se requieren más cambios',
        dto.message?.trim() || (dto.action === 'accept' ? 'La corrección es ahora la versión principal.' : 'La solicitud se cerró.'));
      return this.safe(result);
    });
    if (promoted) this.documents.refreshAcceptedCorrection(promoted);
    return result;
  }

  async download(documentId: number, id: number, actorId: string) {
    return this.write(documentId, async tx => {
      const { document, actor } = await this.context(tx, documentId, actorId);
      const request = await this.request(tx, documentId, id);
      if (!canManageChangeRequests(document, actor) &&
        (request.recipientId !== actorId || !await this.readable(tx, documentId, actor))) throw new NotFoundException('Corrección no encontrada');
      await assertChangeRequestDocument(tx, document);
      if (request.status !== 'CORRECTION_SUBMITTED' || !request.stagedPath) throw new NotFoundException('Corrección no encontrada');
      return { buffer: this.storage.readPrivateCorrection(request.stagedPath), filename: request.filename };
    });
  }
}
