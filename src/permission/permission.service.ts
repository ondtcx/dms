import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GrantDocumentPermissionDto } from './dto/grant-document-permission.dto';
import { ExplainPermissionDto } from './dto/explain-permission.dto';
import { UserRole } from '../auth/role.enum';
import {
  resolveEffectiveRoleKeys,
} from '../role/compatibility-resolver';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { PermissionCatalogItemDto } from './dto/permission-catalog-item.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ManageDocumentSharingDto, DocumentVisibilityDto, LegacyDocumentShareDto } from './dto/manage-document-sharing.dto';
import { SearchSharingRecipientsDto } from './dto/search-sharing-recipients.dto';
import { sharingManagerSelect, assertSharingDocumentAvailable } from '../auth/utils/document-sharing.policy';
import { Prisma, WorkflowStatus } from '@prisma/client';
import { requireResourceAccess, grantResourceAccess, revokeResourceGrant, resourceSharing } from '../directory/inherited-access.policy';
import { notifySharingGrant } from '../notification/sharing-notification';

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  getCatalog(): Promise<PermissionCatalogItemDto[]> {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      select: { id: true, key: true, label: true, isActive: true },
      orderBy: { key: 'asc' },
    });
  }

  private validated<T extends object>(type: new () => T, value: unknown): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Datos de acceso inválidos');
    const dto = plainToInstance(type, value);
    if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length) throw new BadRequestException('Datos de acceso inválidos');
    return dto;
  }

  private async manager(documentId: number, userId: string, db: any = this.prisma) {
    if (!Number.isSafeInteger(documentId) || documentId < 1) throw new BadRequestException('Documento inválido');
    const document = await db.document.findUnique({
      where: { id: documentId },
      include: { directory: { select: { receptionEnabled: true } } },
    });
    await assertSharingDocumentAvailable(db, document);
    const user = await db.user.findUnique({ where: { id: userId }, select: sharingManagerSelect });
    if (document.receptionOriginDirectoryId != null || document.directory?.receptionEnabled) throw new ForbiddenException('No tienes permiso para gestionar el acceso de recepción');
    await requireResourceAccess(db, document, userId, 'document', 'canShare');
    return { document, user };
  }

  private async sharingWrite<T>(documentId: number, actorId: string,
    write: (tx: Prisma.TransactionClient, document: any, user: any) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`;
        const { document, user } = await this.manager(documentId, actorId, tx);
        return write(tx, document, user);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034') throw new ConflictException('El acceso cambió durante la operación. Vuelve a intentarlo');
      throw error;
    }
  }

  async getSharing(documentId: number, actorId: string) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId }, include: { directory: { select: { receptionEnabled: true } } } });
    await assertSharingDocumentAvailable(this.prisma, document);
    if (document.receptionOriginDirectoryId != null || document.directory?.receptionEnabled) throw new ForbiddenException('No tienes permiso para gestionar el acceso de recepción');
    return resourceSharing(this.prisma, document, actorId, 'document');
  }

  async searchRecipients(documentId: number, actorId: string, input: SearchSharingRecipientsDto) {
    const { document } = await this.manager(documentId, actorId);
    const { query } = this.validated(SearchSharingRecipientsDto, input);
    return this.prisma.user.findMany({
      where: { id: { notIn: [actorId, document.uploadedById] }, AND: [
        { OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }] },
        { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] },
      ] },
      select: { id: true, name: true, email: true }, take: 20, orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async grantRead(documentId: number, actorId: string, input: ManageDocumentSharingDto) {
    const dto = this.validated(ManageDocumentSharingDto, input);
    return this.sharingWrite(documentId, actorId, async (tx, document) => {
      const { comment, grantId, ...grantInput } = dto;
      const previous = grantId === undefined
        ? await tx.accessGrant.findFirst({ where: { documentId, userId: dto.userId, grantedById: actorId, revokedAt: null } })
        : await tx.accessGrant.findUnique({ where: { id: grantId } });
      const grant = await grantResourceAccess(tx, document, actorId, 'document', grantInput, grantId);
      await notifySharingGrant(tx, 'document', document, dto.userId, previous, grant, comment);
      return grant;
    });
  }

  async revokeRead(documentId: number, actorId: string, recipientId: string) {
    this.validated(ManageDocumentSharingDto, { userId: recipientId });
    return this.sharingWrite(documentId, actorId, async (tx, document) => {
      if (recipientId === actorId || recipientId === document.uploadedById) throw new BadRequestException('Destinatario inválido');
      const owner = document.uploadedById === actorId;
      await tx.accessGrant.updateMany({ where: { documentId, userId: recipientId, revokedAt: null, ...(!owner ? { grantedById: actorId } : {}) }, data: { revokedAt: new Date() } });
      if (!owner) return { revoked: true, independentAccessMayRemain: true };
      await tx.documentPermission.updateMany({ where: { documentId, userId: recipientId, role: null, roleId: null }, data: { canView: false } });
      await tx.documentPermission.updateMany({ where: { documentId, userId: recipientId, OR: [{ role: { not: null } }, { roleId: { not: null } }] }, data: { userId: null } });
      await tx.documentShare.updateMany({ where: { documentId, userId: recipientId, role: null, roleId: null, courseId: null }, data: { canView: false, revokedAt: new Date(), revokedById: actorId } });
      await tx.documentShare.updateMany({ where: { documentId, userId: recipientId, OR: [{ role: { not: null } }, { roleId: { not: null } }, { courseId: { not: null } }] }, data: { userId: null } });
      return { revoked: true, independentAccessMayRemain: true };
    });
  }

  async setVisibility(documentId: number, actorId: string, input: DocumentVisibilityDto) {
    const dto = this.validated(DocumentVisibilityDto, input);
    return this.sharingWrite(documentId, actorId, async (tx, document, user) => {
      if (document.uploadedById !== actorId) throw new ForbiddenException('Solo el propietario puede cambiar la visibilidad');
      const workflow = await tx.documentWorkflow.findFirst({ where: { documentId, active: true, status: { in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS, WorkflowStatus.CHANGES_REQUESTED] } }, select: { status: true, initiatedById: true } });
      if (workflow && !(workflow.status === WorkflowStatus.CHANGES_REQUESTED && workflow.initiatedById === actorId)) throw new ForbiddenException('No se puede editar un documento con un workflow activo');
      await tx.document.update({ where: { id: documentId }, data: { isPublic: dto.isPublic } });
      return { documentId, isPublic: dto.isPublic, canManageSharing: true };
    });
  }

  // ============ Permisos Específicos de Documentos ============

  async grantDocumentPermission(
    documentId: number,
    grantedById: string,
    grantDto: GrantDocumentPermissionDto,
  ) {
    grantDto = this.validated(GrantDocumentPermissionDto, grantDto);
    if (grantDto.role || grantDto.roleKey || !grantDto.userId || grantDto.canDelete || grantDto.canView === false) throw new BadRequestException('Solo se permiten concesiones a usuarios con lectura y sin eliminación');
    return this.grantRead(documentId, grantedById, {
      userId: grantDto.userId, canEdit: grantDto.canEdit, canUploadVersion: grantDto.canUploadVersion, canShare: grantDto.canShare, expiresAt: grantDto.expiresAt,
    });
  }

  async createDocumentShare(documentId: number, sharedById: string, shareDto: LegacyDocumentShareDto) {
    shareDto = this.validated(LegacyDocumentShareDto, shareDto);
    if (shareDto.role || shareDto.roleKey || !shareDto.userId || shareDto.canView === false) throw new BadRequestException('Solo se permiten concesiones a usuarios');
    return this.grantRead(documentId, sharedById, { userId: shareDto.userId, expiresAt: shareDto.expiresAt });
  }

  async revokeDocumentPermission(permissionId: number, actorId: string) {
    const permission = await this.prisma.documentPermission.findUnique({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException(
        `Permiso de documento con ID ${permissionId} no encontrado`,
      );
    }

    return this.sharingWrite(permission.documentId, actorId, async (tx, document) => {
      const lockedPermission = await tx.documentPermission.findUnique({ where: { id: permissionId } });
      if (!lockedPermission || lockedPermission.documentId !== permission.documentId)
        throw new ConflictException('El permiso cambió durante la operación');
      if (document.uploadedById !== actorId && lockedPermission.grantedById !== actorId) throw new ForbiddenException('No puedes revocar concesiones de otros usuarios');
      await tx.documentPermission.delete({ where: { id: permissionId } });
      return { message: 'Permiso de documento revocado exitosamente' };
    });
  }

  async getDocumentPermissions(documentId: number, actorId: string) {
    await this.manager(documentId, actorId);
    return this.prisma.documentPermission.findMany({
      where: { documentId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async revokeSharingGrant(documentId: number, grantId: number, actorId: string) {
    return this.sharingWrite(documentId, actorId, (tx, document) => revokeResourceGrant(tx, document, actorId, 'document', grantId));
  }

  async explainPermission(dto: ExplainPermissionDto, actorId: string) {
    const { documentId, userId } = dto;
    await this.manager(documentId, actorId);

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

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const readable = await this.prisma.document.findFirst({ where: { id: documentId, ...buildDocumentAccessFilter({ id: user.id, role: user.role as UserRole }) }, select: { id: true } });
    return { hasAccess: Boolean(readable), role: user.role, reasons: [readable ? 'Acceso vigente por propiedad, concesión explícita o participación autorizada' : 'Sin acceso vigente'] };
  }

  async getEffectiveAccess(documentId: number, actorId: string, cursor?: string) {
    if (
      cursor !== undefined &&
      (typeof cursor !== 'string' || !cursor.trim() || cursor.length > 200)
    ) {
      throw new BadRequestException('Cursor de acceso inválido');
    }
    const { user: actor } = await this.manager(documentId, actorId);
    const roles = resolveEffectiveRoleKeys(
      actor.role,
      (actor.roleAssignments ?? []).map(({ role }) => role),
    );
    if (
      ![UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR].some(role => roles.includes(role))
    ) {
      throw new ForbiddenException('No tienes autorización para auditar accesos');
    }

    // La página acota tanto los usuarios candidatos como las evaluaciones de
    // lectura. No replica reglas de recepción, académicas ni concesiones.
    const limit = 25;
    const candidates = await this.prisma.user.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { id: true, key: true, isActive: true } } },
        },
      },
      take: limit + 1,
      orderBy: { id: 'asc' },
    });
    const page = candidates.slice(0, limit);
    // Prisma ejecuta el lote acotado en una transacción; no se carga el universo
    // de usuarios ni se realizan consultas adicionales por sus relaciones.
    const access = await this.prisma.$transaction(
      page.map(user =>
        this.prisma.document.findFirst({
          where: {
            id: documentId,
            ...buildDocumentAccessFilter({
              id: user.id,
              role: user.role as UserRole,
              assignments: user.roleAssignments.map(({ role }) => role),
            }),
          },
          select: { id: true },
        }),
      ),
    );
    return {
      documentId,
      users: page
        .filter((_, index) => access[index]?.id === documentId)
        .map(({ id, name, email, role }) => ({ id, name, email, role })),
      nextCursor: candidates.length > limit ? page[page.length - 1].id : null,
    };
  }
}
