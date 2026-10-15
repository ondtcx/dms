import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowStatus } from '@prisma/client';
import { UserRole } from '../auth/role.enum';
import { buildDocumentAccessFilter, buildOrdinaryDirectoryAccessFilter } from '../auth/utils/document-access.filter';
import { loadInheritedAccess, requireResourceAccess, grantResourceAccess, revokeResourceGrant, resourceSharing } from './inherited-access.policy';
import { ResourceSharingDto, DirectoryVisibilityDto } from './dto/manage-directory-sharing.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectoryDto } from './dto/create-directory.dto';
import { UpdateDirectoryDto } from './dto/update-directory.dto';
import { ConfigureReceptionDirectoryDto } from './dto/configure-reception-directory.dto';
import { DirectoryParticipantDto, DirectoryDelegateDto } from './dto/manage-directory-membership.dto';
import { SearchDirectoryRecipientsDto } from './dto/search-directory-recipients.dto';
import { resolveReceptionCapabilities, canGrantReceptionDelegate, ReceptionCapabilities } from './directory-reception.policy';
import { notifySharingGrant } from '../notification/sharing-notification';

type DirectoryUser = { id: string; role: UserRole };
export type ReceptionMutationDocument = Pick<Prisma.DocumentGetPayload<object>,
  'id' | 'uploadedById' | 'directoryId' | 'receptionOriginDirectoryId'>;
export type ReceptionMutationOperation = 'edit' | 'withdraw';

// Alcance de recepción de un documento concreto, resuelto con el cliente
// indicado (incluida la transacción). El origen durable manda sobre la ubicación
// física; una carpeta ordinaria devuelve un marcador neutro para conservar los
// contratos previos de workflow. Un origen roto o una identidad eliminada fallan
// cerrado y no conceden ninguna capacidad.
export interface DocumentReceptionScope {
  reception: boolean;
  directoryId: number | null;
  capabilities: ReceptionCapabilities | null;
  actorId: string | null;
  actorRole: UserRole | null;
}

function ordinaryReceptionScope(): DocumentReceptionScope {
  return { reception: false, directoryId: null, capabilities: null, actorId: null, actorRole: null };
}

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  // El llamador prepara archivos fuera de esta transacción. Ningún recibo se
  // confirma separado de la escritura del documento o del resto del lote.
  async submissionTransaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034') {
        throw new ConflictException('La recepción cambió durante la operación. Vuelve a intentarlo');
      }
      throw error;
    }
  }

  // El documento procede de la base de datos, bloqueado por el llamador en la
  // escritura final Serializable; la comprobación previa no sustituye esa lectura.
  async assertDocumentMutation(
    db: Prisma.TransactionClient,
    document: ReceptionMutationDocument,
    userId: string,
    operation: ReceptionMutationOperation,
  ): Promise<boolean> {
    const scope = await this.resolveDocumentReceptionScope(db, document, userId);
    if (!scope.reception) return false;
    if (!userId || document.uploadedById !== userId) throw new ForbiddenException('Solo el autor puede modificar su documento de recepción');
    if (!scope.capabilities?.submit) throw new ForbiddenException('La participación ya no está vigente');
    if (operation === 'withdraw') {
      const workflow = await db.documentWorkflow.findFirst({ where: {
        documentId: document.id, active: true,
        status: { notIn: [WorkflowStatus.APPROVED, WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED] },
      }, select: { id: true } });
      if (workflow) throw new ConflictException('No se puede retirar o restaurar un documento con una revisión activa');
    }
    return true;
  }

  // Resuelve el alcance de recepción de un documento concreto con el cliente
  // indicado. El origen durable manda; la elegibilidad usa solo la participación
  // viva y las asignaciones de catálogo activas, nunca el rol global ni un rol
  // heredado. No consulta concesiones ordinarias.
  async resolveDocumentReceptionScope(
    db: Prisma.TransactionClient,
    document: ReceptionMutationDocument,
    actorId: string,
  ): Promise<DocumentReceptionScope> {
    const origin = document.receptionOriginDirectoryId;
    const directoryId = origin ?? document.directoryId;
    if (directoryId == null) return ordinaryReceptionScope();
    const directory = await db.directory.findUnique({ where: { id: directoryId } });
    if (origin == null && !directory?.receptionEnabled) return ordinaryReceptionScope();
    if (!directory?.receptionEnabled) throw new ForbiddenException('La recepción de origen no está disponible');
    if (!actorId) throw new ForbiddenException('La participación ya no está vigente');
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor) throw new ForbiddenException('La participación ya no está vigente');
    const capabilities = await this.resolveForDirectory(directory, { id: actor.id, role: actor.role as UserRole }, db);
    return { reception: true, directoryId: directory.id, capabilities, actorId: actor.id, actorRole: actor.role as UserRole };
  }

  // Exige acceso de lectura vigente reutilizando el filtro compartido de acceso a
  // documentos: no duplica la semántica de lectura de recepción ni la amplía.
  async assertReceptionRead(
    db: Prisma.TransactionClient,
    documentId: number,
    scope: DocumentReceptionScope,
  ): Promise<void> {
    if (!scope.reception) return;
    const readable = await db.document.findFirst({
      where: {
        id: documentId,
        ...buildDocumentAccessFilter({ id: scope.actorId as string, role: scope.actorRole as UserRole }),
      },
      select: { id: true },
    });
    if (!readable) throw new ForbiddenException('No tienes acceso a este documento de recepción');
  }

  async prepareSubmission(
    db: Prisma.TransactionClient,
    destination: number | null,
    user: DirectoryUser,
    document?: { id: number; uploadedById: string; directoryId: number | null; receptionOriginDirectoryId: number | null },
  ): Promise<number | null> {
    // Para movimientos el documento ya debe estar bloqueado por el llamador.
    const ids = [...new Set([destination, document?.directoryId, document?.receptionOriginDirectoryId]
      .filter((id): id is number => id != null))].sort((a, b) => a - b);
    for (const id of ids) await db.$queryRaw(Prisma.sql`SELECT id FROM "Directory" WHERE id = ${id} FOR UPDATE`);
    const source = document?.directoryId == null ? null : await db.directory.findUnique({ where: { id: document.directoryId } });
    const origin = document?.receptionOriginDirectoryId ?? (source?.receptionEnabled ? source.id : null);
    const target = destination == null ? null : await db.directory.findUnique({ where: { id: destination } });
    if (destination != null && !target) throw new NotFoundException('Directorio no encontrado');
    if (origin != null && target?.receptionEnabled && origin !== target.id) {
      throw new ConflictException('No se puede trasladar un documento con origen en otra recepción');
    }
    if (origin != null || target?.receptionEnabled) {
      if (document && document.uploadedById !== user.id) throw new ForbiddenException('Solo el autor puede presentar o retirar su documento');
      if (origin != null) await this.receptionContext(origin, user, db, 'submit');
      if (target?.receptionEnabled && target.id !== origin) await this.receptionContext(target.id, user, db, 'submit');
      if (document && origin != null && destination !== document.directoryId) {
        const activeReview = await db.documentWorkflow.findFirst({
          where: { documentId: document.id, active: true, status: { notIn: [WorkflowStatus.APPROVED, WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED] } },
          select: { id: true },
        });
        if (activeReview) throw new ConflictException('No se puede retirar o mover un documento con una revisión activa');
      }
    }
    if (target && !target.receptionEnabled) await requireResourceAccess(db, target, user.id, 'directory', 'canUploadVersion');
    return origin ?? (target?.receptionEnabled ? target.id : null);
  }

  // Solo se invoca bajo los bloqueos de prepareSubmission y dentro de la misma
  // transacción Serializable. No existe liberación de cupos ni conteo de versiones.
  async recordSubmission(db: Prisma.TransactionClient, document: { id: number; uploadedById: string }, origin: number | null) {
    if (origin == null) return;
    const where = { directoryId_documentId: { directoryId: origin, documentId: document.id } };
    const existing = await db.receptionSubmission.findUnique({ where });
    if (existing) {
      if (existing.uploadedById !== document.uploadedById) throw new ConflictException('El autor histórico no coincide');
      return;
    }
    const directory = await db.directory.findUnique({ where: { id: origin } });
    if (!directory?.receptionEnabled) throw new ConflictException('La recepción ya no está disponible');
    if (directory.singleDocumentPerParticipant && await db.receptionSubmission.count({ where: { directoryId: origin, uploadedById: document.uploadedById } })) {
      throw new ConflictException('El cupo de recepción ya está ocupado por otro documento');
    }
    await db.receptionSubmission.create({ data: { directoryId: origin, documentId: document.id, uploadedById: document.uploadedById } });
  }

  async findChildren(parentId: number | undefined, user: DirectoryUser) {
    if (parentId !== undefined) await this.assertDiscoverable(parentId, user);
    const visibleIds = await this.getDiscoverableIds(user);
    const children = await this.prisma.directory.findMany({
      where: {
        parentId: parentId ?? null,
        id: { in: [...visibleIds] },
      },
      orderBy: { name: 'asc' },
    });
    return this.withAccess(children, user);
  }

  async getBreadcrumb(id: number, user: DirectoryUser) {
    await this.assertDiscoverable(id, user);
    const breadcrumb = [];
    let currentId: number | null = id;
    while (currentId !== null) {
      const directory = await this.prisma.directory.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
      if (!directory) break;
      breadcrumb.unshift(directory);
      currentId = directory.parentId;
    }
    return breadcrumb;
  }

  async getNavigationSummary(user: DirectoryUser) {
    const discoverableIds = await this.getDiscoverableIds(user);
    const [recent, mostUsed] = await Promise.all([
      this.getUsageDirectories(user, discoverableIds, [{ lastAccessedAt: 'desc' }]),
      this.getUsageDirectories(user, discoverableIds, [{ accessCount: 'desc' }, { lastAccessedAt: 'desc' }]),
    ]);
    return { recent, mostUsed };
  }

  async getAccessibleDirectories(page: number | undefined, limit: number | undefined, user: DirectoryUser) {
    const resolvedPage = page ?? 1;
    const resolvedLimit = limit ?? 50;
    if (!Number.isInteger(resolvedPage) || resolvedPage < 1) {
      throw new BadRequestException('La página debe ser un entero mayor o igual a 1');
    }
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > 100) {
      throw new BadRequestException('El límite debe estar entre 1 y 100');
    }

    const ids = [...(await this.getDiscoverableIds(user))];
    const total = ids.length;
    const data = await this.prisma.directory.findMany({
      where: { id: { in: ids } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (resolvedPage - 1) * resolvedLimit,
      take: resolvedLimit,
    });
    return {
      data: await this.withAccess(data, user),
      meta: { page: resolvedPage, limit: resolvedLimit, total, totalPages: Math.ceil(total / resolvedLimit) },
    };
  }

  private async getUsageDirectories(user: DirectoryUser, discoverableIds: Set<number>, orderBy: any[]) {
    if (!discoverableIds.size) return [];
    const usage = await this.prisma.userDirectoryUsage.findMany({
      where: { userId: user.id, directoryId: { in: [...discoverableIds] } },
      orderBy,
      take: 5,
      include: { directory: true },
    });
    return this.withAccess(usage.map((entry: any) => entry.directory).filter(Boolean), user);
  }

  async create(dto: CreateDirectoryDto, user: DirectoryUser) {
    const name = this.normalizeName(dto.name);
    this.rejectOwnershipFields(dto);
    return this.structuralTransaction(async (db) => {
      if (dto.parentId !== undefined && dto.parentId !== null) {
        await this.assertOrdinaryAncestors(dto.parentId, db);
        await this.assertCanUpload(dto.parentId, user, db);
      }
      return db.directory.create({
        data: { name, nameNormalized: this.normalizeKey(name), parentId: dto.parentId ?? null, createdById: user.id },
      });
    });
  }

  async update(id: number, dto: UpdateDirectoryDto, user: DirectoryUser) {
    this.rejectOwnershipFields(dto);
    return this.structuralTransaction(async (db) => {
      const current = await this.getForManagement(id, user, db);
      if (current.receptionEnabled && dto.parentId !== undefined && dto.parentId !== current.parentId) {
        throw new ConflictException('No se permite mover una carpeta de recepción');
      }
      const parentId = dto.parentId === undefined ? current.parentId : dto.parentId;
      if (parentId != null && parentId !== current.parentId) await this.assertOrdinaryAncestors(parentId, db);
      if (parentId !== null && parentId !== undefined) {
        if (parentId !== current.parentId) await this.assertCanUpload(parentId, user, db);
      }
      if (parentId === id || (parentId != null && await this.isDescendant(id, parentId, db))) {
        throw new ConflictException('No se puede crear un ciclo en la jerarquía');
      }
      const name = dto.name === undefined ? current.name : this.normalizeName(dto.name);
      return db.directory.update({
        where: { id },
        data: { name, nameNormalized: this.normalizeKey(name), parentId },
      });
    });
  }

  async remove(id: number, user: DirectoryUser) {
    return this.structuralTransaction(async (db) => {
      const directory = await this.getForManagement(id, user, db);
      if (directory.createdById !== user.id) throw new ForbiddenException('Solo el propietario puede eliminar este directorio');
      const [children, documents, history] = await Promise.all([
        db.directory.count({ where: { parentId: id } }),
        db.document.count({ where: { OR: [{ directoryId: id }, { receptionOriginDirectoryId: id }] } }),
        db.receptionSubmission.count({ where: { directoryId: id } }),
      ]);
      if (history > 0) throw new ConflictException('No se puede eliminar una recepción con historial de presentaciones');
      if (children > 0 || documents > 0) {
        throw new ConflictException('Solo se pueden eliminar directorios vacíos');
      }
      return db.directory.delete({ where: { id } });
    });
  }

  async recordVisit(directoryId: number, eventId: string, user: DirectoryUser) {
    return this.prisma.$transaction(async (tx: any) => {
      const existingEvent = await tx.directoryNavigationEvent.findUnique({
        where: { userId_eventId: { userId: user.id, eventId } },
        select: { directoryId: true },
      });

      if (existingEvent) {
        if (existingEvent.directoryId !== directoryId) {
          throw new BadRequestException('El evento de navegación ya fue utilizado para otro directorio');
        }
        await this.assertDiscoverable(directoryId, user, tx);
        return;
      }

      await this.assertDiscoverable(directoryId, user, tx);
      await tx.directoryNavigationEvent.create({
        data: { userId: user.id, directoryId, eventId },
      });
      await tx.userDirectoryUsage.upsert({
        where: { userId_directoryId: { userId: user.id, directoryId } },
        create: { userId: user.id, directoryId, accessCount: 1 },
        update: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      });
    });
  }

  private async getForManagement(id: number, user: DirectoryUser, db: any) {
    const directory = await db.directory.findUnique({ where: { id } });
    if (!directory || !(await this.isDiscoverable(directory, user, db))) {
      throw new NotFoundException('Directorio no encontrado');
    }
    if (directory.receptionEnabled) {
      const capabilities = await this.resolveForDirectory(directory, user, db);
      if (!capabilities.manageStructure) throw new ForbiddenException('No tienes permiso para administrar la estructura');
      return directory;
    }
    await requireResourceAccess(db, directory, user.id, 'directory', 'canEdit');
    return directory;
  }

  async assertDiscoverable(id: number, user: DirectoryUser, db: any = this.prisma) {
    const directory = await db.directory.findUnique({ where: { id } });
    if (!directory || !(await this.isDiscoverable(directory, user, db))) {
      throw new NotFoundException('Directorio no encontrado');
    }
    return directory;
  }

  private async isDiscoverable(directory: { id: number; createdById: string; receptionEnabled?: boolean }, user: DirectoryUser, db: any) {
    if (directory.receptionEnabled) return (await this.resolveForDirectory(directory, user, db)).discover;
    if (directory.createdById === user.id) return true;
    const visibleIds = await this.getDiscoverableIds(user, db);
    return visibleIds.has(directory.id);
  }

  private async getDiscoverableIds(user: DirectoryUser, db: any = this.prisma): Promise<Set<number>> {
    const access = buildDocumentAccessFilter(user);
    const documents = await db.document.findMany({
      where: { ...(access ?? {}), directoryId: { not: null } },
      select: { directoryId: true },
    });
    const ids = new Set<number>(documents.map((document) => document.directoryId).filter((id): id is number => id !== null));
    let pending = [...ids];
    while (pending.length) {
      const parents = await db.directory.findMany({
        where: { id: { in: pending } },
        select: { id: true, parentId: true },
      });
      const next: number[] = [];
      for (const parent of parents) {
        if (parent.parentId !== null && !ids.has(parent.parentId)) {
          ids.add(parent.parentId);
          next.push(parent.parentId);
        }
      }
      pending = next;
    }
    const owned = await db.directory.findMany({ where: buildOrdinaryDirectoryAccessFilter(user.id), select: { id: true } });
    owned.forEach(({ id }) => ids.add(id));
    if (ids.size && db.directoryAncestor) {
      const ancestors = await db.directoryAncestor.findMany({ where: { descendantId: { in: [...ids] } }, select: { ancestorId: true } });
      ancestors.forEach(({ ancestorId }) => ids.add(ancestorId));
    }
    return this.withReceptionDiscovery(ids, user, db);
  }

  private async withReceptionDiscovery(ids: Set<number>, user: DirectoryUser, db: any) {
    const directories = await db.directory.findMany({ where: { receptionEnabled: true } });
    for (const directory of directories) {
      if (!directory.receptionEnabled) continue;
      ids.delete(directory.id);
      if ((await this.resolveForDirectory(directory, user, db)).discover) {
        ids.add(directory.id);
        let parentId: number | null = directory.parentId ?? null;
        const seen = new Set<number>();
        while (parentId !== null && !seen.has(parentId)) {
          seen.add(parentId);
          const parent = await db.directory.findUnique({ where: { id: parentId } });
          if (!parent || parent.receptionEnabled) break;
          ids.add(parent.id);
          parentId = parent.parentId ?? null;
        }
      }
    }
    return ids;
  }

  private async isDescendant(ancestorId: number, candidateId: number, db: any) {
    let currentId: number | null = candidateId;
    while (currentId !== null) {
      const current = await db.directory.findUnique({ where: { id: currentId }, select: { parentId: true } });
      if (!current) return false;
      if (current.parentId === ancestorId) return true;
      currentId = current.parentId;
    }
    return false;
  }

  // Todas las mutaciones estructurales comparten comprobaciones y escritura
  // en una sola transacción; un conflicto exige reiniciar la petición completa.
  private async structuralTransaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034') {
        throw new ConflictException('La estructura cambió durante la operación. Vuelve a intentarlo');
      }
      this.rethrowConstraint(error);
    }
  }

  private rejectOwnershipFields(dto: object) {
    if (Object.keys(dto).some((key) => ['createdById', 'createdBy', 'ownerId', 'owner', 'userId'].includes(key))) {
      throw new BadRequestException('No se permite transferir la propiedad ni sustituir la identidad');
    }
  }

  private async assertOrdinaryAncestors(id: number, db: any = this.prisma) {
    let current: number | null = id;
    const seen = new Set<number>();
    while (current !== null) {
      if (seen.has(current)) throw new ConflictException('Jerarquía de carpetas inválida');
      seen.add(current);
      const directory = await db.directory.findUnique({ where: { id: current } });
      if (!directory) throw new NotFoundException('Directorio no encontrado');
      if (directory.receptionEnabled) throw new ConflictException('No se admite anidar carpetas dentro de una recepción');
      current = directory.parentId ?? null;
    }
  }

  private async resolveForDirectory(directory: { id: number; createdById: string }, user: DirectoryUser, db: any): Promise<ReceptionCapabilities> {
    const [directParticipant, roleParticipants, delegate] = await Promise.all([
      db.directoryUserParticipant.findUnique({ where: { directoryId_userId: { directoryId: directory.id, userId: user.id } } }),
      db.directoryRoleParticipant.findMany({ where: {
        directoryId: directory.id,
        role: { isActive: true, assignments: { some: { userId: user.id } } },
      } }),
      db.directoryDelegate.findUnique({ where: { directoryId_userId: { directoryId: directory.id, userId: user.id } } }),
    ]);
    return resolveReceptionCapabilities({ ownerId: directory.createdById, userId: user.id, directParticipant, roleParticipants, delegate });
  }

  private async receptionContext(id: number, user: DirectoryUser, db: any, permission?: keyof ReceptionCapabilities) {
    const directory = await db.directory.findUnique({ where: { id } });
    if (!directory) throw new NotFoundException('Directorio no encontrado');
    if (!directory.receptionEnabled) throw new BadRequestException('La carpeta no está configurada como recepción');
    const capabilities = await this.resolveForDirectory(directory, user, db);
    if (!capabilities.discover) throw new NotFoundException('Directorio no encontrado');
    if (permission && !capabilities[permission]) throw new ForbiddenException('No tienes permiso para esta operación');
    return { directory, capabilities };
  }

  async getReception(id: number, user: DirectoryUser) {
    const { directory, capabilities } = await this.receptionContext(id, user, this.prisma);
    return { directoryId: id, enabled: true, singleDocumentPerParticipant: directory.singleDocumentPerParticipant, capabilities };
  }

  async assertCanUpload(id: number, user: DirectoryUser, db: any = this.prisma) {
    const directory = await db.directory.findUnique({ where: { id } });
    if (!directory) throw new NotFoundException('Directorio no encontrado');
    if (directory.receptionEnabled) await this.receptionContext(id, user, db, 'submit');
    else await requireResourceAccess(db, directory, user.id, 'directory', 'canUploadVersion');
    return directory;
  }

  private async withAccess(directories: any[], user: DirectoryUser) {
    const access = await loadInheritedAccess(this.prisma, directories, user.id, 'directory', true);
    return directories.map(directory => ({ ...directory,
      capabilities: directory.receptionEnabled ? undefined : access.get(directory.id)?.capabilities,
      sharingProvenance: directory.receptionEnabled ? [] : access.get(directory.id)?.provenance,
      sharingSummary: directory.receptionEnabled ? undefined : access.get(directory.id)?.sharingSummary,
      navigationOnly: !directory.receptionEnabled && !access.get(directory.id)?.capabilities.canView,
    }));
  }

  private async sharingDirectory(id: number, db: any) {
    const directory = await db.directory.findUnique({ where: { id } });
    if (!directory) throw new NotFoundException('Directorio no encontrado');
    if (directory.receptionEnabled) throw new ForbiddenException('La recepción no admite concesiones ordinarias ni acceso público');
    return directory;
  }

  async getSharing(id: number, user: DirectoryUser) {
    return resourceSharing(this.prisma, await this.sharingDirectory(id, this.prisma), user.id, 'directory');
  }

  async grantSharing(id: number, dto: ResourceSharingDto, user: DirectoryUser) {
    return this.structuralTransaction(async db => {
      await db.$queryRaw`SELECT id FROM "Directory" WHERE id = ${id} FOR UPDATE`;
      const directory = await this.sharingDirectory(id, db);
      const previous = await db.accessGrant.findFirst({ where: { directoryId: id, userId: dto.userId, grantedById: user.id, revokedAt: null } });
      const grant = await grantResourceAccess(db, directory, user.id, 'directory', dto);
      await notifySharingGrant(db, 'directory', directory, dto.userId, previous, grant);
      return grant;
    });
  }

  async revokeSharing(id: number, grantId: number, user: DirectoryUser) {
    return this.structuralTransaction(async db => {
      await db.$queryRaw`SELECT id FROM "Directory" WHERE id = ${id} FOR UPDATE`;
      const directory = await this.sharingDirectory(id, db);
      await requireResourceAccess(db, directory, user.id, 'directory', 'canView');
      return revokeResourceGrant(db, directory, user.id, 'directory', grantId);
    });
  }

  async setVisibility(id: number, dto: DirectoryVisibilityDto, user: DirectoryUser) {
    if (typeof dto.isPublic !== 'boolean' || Object.keys(dto).some(k => k !== 'isPublic')) throw new BadRequestException('Visibilidad inválida');
    return this.structuralTransaction(async db => {
      await db.$queryRaw`SELECT id FROM "Directory" WHERE id = ${id} FOR UPDATE`;
      const directory = await this.sharingDirectory(id, db);
      await requireResourceAccess(db, directory, user.id, 'directory', 'canView');
      if (directory.createdById !== user.id) throw new ForbiddenException('Solo el propietario puede cambiar la visibilidad');
      return db.directory.update({ where: { id }, data: { isPublic: dto.isPublic } });
    });
  }

  async searchSharingRecipients(id: number, q: string, user: DirectoryUser) {
    const directory = await this.sharingDirectory(id, this.prisma);
    await requireResourceAccess(this.prisma, directory, user.id, 'directory', 'canShare');
    if (typeof q !== 'string' || q.trim().length < 2 || q.length > 100) throw new BadRequestException('Consulta inválida');
    return this.prisma.user.findMany({ where: {
      id: { notIn: [user.id, directory.createdById] },
      AND: [{ OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
        { OR: [{ name: { contains: q.trim(), mode: 'insensitive' } }, { email: { contains: q.trim(), mode: 'insensitive' } }] }],
    }, select: { id: true, name: true, email: true }, take: 20, orderBy: { id: 'asc' } });
  }

  async configureReception(id: number, dto: ConfigureReceptionDirectoryDto, user: DirectoryUser) {
    this.rejectOwnershipFields(dto);
    return this.structuralTransaction(async (db) => {
      const directory = await db.directory.findUnique({ where: { id } });
      if (!directory) throw new NotFoundException('Directorio no encontrado');
      if (directory.receptionEnabled) {
        await this.receptionContext(id, user, db, 'configure');
        if (!dto.enabled) throw new ConflictException('No se puede desactivar la recepción porque eliminaría su privacidad');
      } else {
        if (directory.createdById !== user.id) throw new ForbiddenException('Solo el propietario puede convertir una carpeta');
        if (!dto.enabled) throw new BadRequestException('Debe activar la recepción');
        const [documents, children] = await Promise.all([
          db.document.count({ where: { directoryId: id } }), db.directory.count({ where: { parentId: id } }),
        ]);
        if (documents || children) throw new ConflictException('Solo se pueden convertir carpetas vacías y sin descendientes');
        if (directory.parentId != null) await this.assertOrdinaryAncestors(directory.parentId, db);
      }
      const updated = await db.directory.update({ where: { id }, data: {
        receptionEnabled: true,
        isPublic: false,
        ...(dto.singleDocumentPerParticipant !== undefined ? { singleDocumentPerParticipant: dto.singleDocumentPerParticipant } : {}),
      } });
      return { directoryId: id, enabled: true, singleDocumentPerParticipant: updated.singleDocumentPerParticipant,
        capabilities: await this.resolveForDirectory(updated, user, db) };
    });
  }

  async getMembership(id: number, user: DirectoryUser) {
    const { capabilities } = await this.receptionContext(id, user, this.prisma);
    if (!capabilities.manageParticipants && !capabilities.manageDelegates) throw new ForbiddenException('No tienes permiso para consultar membresías');
    const [users, roles, delegates] = await Promise.all([
      capabilities.manageParticipants ? this.prisma.directoryUserParticipant.findMany({ where: { directoryId: id } }) : [],
      capabilities.manageParticipants ? this.prisma.directoryRoleParticipant.findMany({ where: { directoryId: id } }) : [],
      capabilities.manageDelegates ? this.prisma.directoryDelegate.findMany({ where: { directoryId: id } }) : [],
    ]);
    return { users, roles, delegates };
  }

  async setParticipant(id: number, dto: DirectoryParticipantDto, user: DirectoryUser) {
    if ((dto.userId !== undefined) === (dto.roleId !== undefined)) throw new BadRequestException('Debe indicar exactamente un usuario o un rol');
    return this.prisma.$transaction(async (db: any) => {
      await this.receptionContext(id, user, db, 'manageParticipants');
      if (dto.userId !== undefined) {
        if (!await db.user.findUnique({ where: { id: dto.userId }, select: { id: true } })) throw new BadRequestException('Usuario no válido');
        return db.directoryUserParticipant.upsert({ where: { directoryId_userId: { directoryId: id, userId: dto.userId } },
          create: { directoryId: id, userId: dto.userId, peerRead: dto.peerRead }, update: { peerRead: dto.peerRead } });
      }
      if (!await db.role.findFirst({ where: { id: dto.roleId, isActive: true }, select: { id: true } })) throw new BadRequestException('Rol activo no válido');
      return db.directoryRoleParticipant.upsert({ where: { directoryId_roleId: { directoryId: id, roleId: dto.roleId } },
        create: { directoryId: id, roleId: dto.roleId, peerRead: dto.peerRead }, update: { peerRead: dto.peerRead } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeParticipant(id: number, kind: 'user' | 'role', target: string | number, user: DirectoryUser) {
    return this.prisma.$transaction(async (db: any) => {
      await this.receptionContext(id, user, db, 'manageParticipants');
      const model = kind === 'user' ? db.directoryUserParticipant : db.directoryRoleParticipant;
      await model.deleteMany({ where: { directoryId: id, ...(kind === 'user' ? { userId: target } : { roleId: target }) } });
      return { removed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setDelegate(id: number, targetId: string, dto: DirectoryDelegateDto, user: DirectoryUser) {
    this.rejectOwnershipFields(dto);
    return this.prisma.$transaction(async (db: any) => {
      const { directory, capabilities } = await this.receptionContext(id, user, db, 'manageDelegates');
      if (targetId === directory.createdById || !canGrantReceptionDelegate(capabilities, user.id, targetId, dto)) {
        throw new ForbiddenException('No se permite autodelegación ni otorgar permisos superiores a los propios');
      }
      const existing = await db.directoryDelegate.findUnique({ where: { directoryId_userId: { directoryId: id, userId: targetId } } });
      if (existing && !canGrantReceptionDelegate(capabilities, user.id, targetId, existing)) throw new ForbiddenException('No puedes modificar un delegado con permisos superiores');
      if (!await db.user.findUnique({ where: { id: targetId }, select: { id: true } })) throw new BadRequestException('Usuario no válido');
      const flags = { full: dto.full === true, configure: dto.configure === true, manageParticipants: dto.manageParticipants === true,
        readAll: dto.readAll === true || dto.review === true, review: dto.review === true, manageDelegates: dto.manageDelegates === true, manageStructure: dto.manageStructure === true };
      return db.directoryDelegate.upsert({ where: { directoryId_userId: { directoryId: id, userId: targetId } },
        create: { directoryId: id, userId: targetId, ...flags }, update: flags });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeDelegate(id: number, targetId: string, user: DirectoryUser) {
    return this.prisma.$transaction(async (db: any) => {
      const { directory, capabilities } = await this.receptionContext(id, user, db, 'manageDelegates');
      const existing = await db.directoryDelegate.findUnique({ where: { directoryId_userId: { directoryId: id, userId: targetId } } });
      if (targetId === directory.createdById || !canGrantReceptionDelegate(capabilities, user.id, targetId, existing ?? {})) throw new ForbiddenException('No puedes eliminar esta delegación');
      await db.directoryDelegate.deleteMany({ where: { directoryId: id, userId: targetId } });
      return { removed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async searchRecipients(id: number, kind: 'users' | 'roles', query: SearchDirectoryRecipientsDto, user: DirectoryUser) {
    const { capabilities } = await this.receptionContext(id, user, this.prisma);
    if (!capabilities.manageParticipants && !capabilities.manageDelegates) throw new ForbiddenException('No tienes permiso para buscar destinatarios');
    const take = query.limit ?? 20;
    const q = query.q?.trim();
    if (!Number.isInteger(take) || take < 1 || take > 50 || (q !== undefined && (q.length < 2 || q.length > 100))) throw new BadRequestException('Consulta de destinatarios no válida');
    if (kind === 'users') {
      if (!q) throw new BadRequestException('Escribe al menos dos caracteres para buscar usuarios');
      return this.prisma.user.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, email: true }, orderBy: { id: 'asc' }, take });
    }
    return this.prisma.role.findMany({ where: { isActive: true, ...(q ? { OR: [{ key: { contains: q, mode: 'insensitive' } }, { label: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, key: true, label: true }, orderBy: { id: 'asc' }, take });
  }

  private normalizeName(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('El nombre del directorio no puede estar vacío');
    return normalized;
  }

  private normalizeKey(name: string) {
    return name.toLocaleLowerCase();
  }

  private rethrowConstraint(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError || (error as any)?.code) {
      const code = (error as Prisma.PrismaClientKnownRequestError).code;
      if (!['P2002', 'P2003'].includes(code)) throw error;
      throw new ConflictException('Ya existe un directorio con ese nombre en este nivel');
    }
    throw error;
  }
}
