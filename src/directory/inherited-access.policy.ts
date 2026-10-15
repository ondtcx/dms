import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ResourceSharingDto } from './dto/manage-directory-sharing.dto';

export interface AccessFlags {
  canView: boolean;
  canEdit: boolean;
  canUploadVersion: boolean;
  canShare: boolean;
}
export type EffectiveAccess = AccessFlags & { owner: boolean };
export interface SharingSummary {
  shared: boolean;
  direct: boolean;
  inherited: boolean;
  public: boolean;
}
const NO_SHARING: SharingSummary = { shared: false, direct: false, inherited: false, public: false };
export const NO_ACCESS: AccessFlags = { canView: false, canEdit: false, canUploadVersion: false, canShare: false };
export const FULL_ACCESS: AccessFlags = { canView: true, canEdit: true, canUploadVersion: true, canShare: true };
export const ACCESS_FLAGS = ['canView', 'canEdit', 'canUploadVersion', 'canShare'] as const;

export function resolveAccess(ownerId: string, actorId: string, isPublic: boolean, grants: Partial<AccessFlags>[]): EffectiveAccess {
  const owner = Boolean(actorId) && ownerId === actorId;
  const result = { ...(owner ? FULL_ACCESS : NO_ACCESS), owner };
  if (!actorId) return result;
  result.canView ||= isPublic;
  for (const grant of grants) for (const key of ACCESS_FLAGS) result[key] ||= grant[key] === true;
  return result;
}

export function assertGrantSubset(authority: AccessFlags, requested: AccessFlags): void {
  if (!authority.canShare || ACCESS_FLAGS.some(key => requested[key] && !authority[key])) {
    throw new ForbiddenException('No puedes conceder permisos superiores a tu autoridad vigente');
  }
}

// Consulta acotada por los documentos/carpetas devueltos, no por cada fila.
// La vista SQL elimina concesiones expiradas/revocadas y cadenas sin autoridad.
export async function loadInheritedAccess(db: any, resources: Array<{
  id: number; directoryId?: number | null; uploadedById?: string; createdById?: string;
  isPublic?: boolean; receptionOriginDirectoryId?: number | null;
  directory?: { receptionEnabled?: boolean } | null; receptionEnabled?: boolean;
}>, actorId: string, kind: 'document' | 'directory', includeSharingSummary = false) {
  const result = new Map<number, { capabilities: EffectiveAccess; provenance: any[]; grants: any[]; ownershipSource: number | null; sharingSummary: SharingSummary }>();
  if (!resources.length) return result;
  const locations = [...new Set(resources.map(r => kind === 'directory' ? r.id : r.directoryId).filter(id => id != null))];
  const edges: any[] = locations.length && db.directoryAncestor ? await db.directoryAncestor.findMany({
    where: { descendantId: { in: locations } },
    include: { ancestor: { select: { id: true, name: true, createdById: true, isPublic: true, receptionEnabled: true } } },
    orderBy: { depth: 'asc' },
  }) : [];
  const ancestorIds = [...new Set(edges.map(e => e.ancestorId))];
  const grants: any[] = actorId && db.effectiveAccessGrant ? await db.effectiveAccessGrant.findMany({ where: {
    userId: actorId, OR: [
      ...(kind === 'document' ? [{ documentId: { in: resources.map(r => r.id) } }] : []),
      { directoryId: { in: ancestorIds } },
    ],
  } }) : [];
  const expiry = { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] };
  const legacy: any[] = actorId && kind === 'document' ? (await Promise.all([
    db.documentPermission?.findMany?.({ where: { documentId: { in: resources.map(r => r.id) }, userId: actorId, canView: true, ...expiry } }) ?? [],
    db.documentShare?.findMany?.({ where: { documentId: { in: resources.map(r => r.id) }, userId: actorId, canView: true, revokedAt: null, ...expiry } }) ?? [],
  ])).flat().map(g => ({ ...g, legacy: true, grantedById: g.grantedById ?? g.sharedById,
    canView: true, canEdit: false, canUploadVersion: false, canShare: false })) : [];
  const grantorIds = [...new Set([...grants, ...legacy].map(g => g.grantedById).filter(Boolean))];
  const grantors: any[] = grantorIds.length ? await db.user.findMany({ where: { id: { in: grantorIds } }, select: { id: true, name: true, email: true } }) : [];
  const sharedDocuments = new Set<number>();
  const sharedDirectories = new Set<number>();
  if (includeSharingSummary && actorId) {
    const ordinary = resources.filter(r => !r.receptionEnabled && r.receptionOriginDirectoryId == null && !r.directory?.receptionEnabled);
    const ordinaryLocations = new Set(ordinary.map(r => kind === 'directory' ? r.id : r.directoryId));
    const directoryOwners = new Map<number, string>();
    if (kind === 'directory') {
      for (const directory of ordinary) if (directory.createdById) directoryOwners.set(directory.id, directory.createdById);
    }
    for (const edge of edges) {
      if (ordinaryLocations.has(edge.descendantId) && !edge.ancestor.receptionEnabled && edge.ancestor.createdById) {
        directoryOwners.set(edge.ancestorId, edge.ancestor.createdById);
      }
    }
    const documentScope = kind === 'document' ? ordinary.filter(r => r.uploadedById).map(r => ({
      documentId: r.id, userId: { not: r.uploadedById },
    })) : [];
    const scope = [...documentScope, ...[...directoryOwners].map(([directoryId, ownerId]) => ({
      directoryId, userId: { not: ownerId },
    }))];
    // Consultas por página, separadas de las concesiones del actor. Solo se
    // seleccionan IDs de recursos: no se exponen destinatarios ni sus identidades.
    const summaryExpiry = { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] };
    const legacyScope = { canView: true, userId: { not: null }, ...summaryExpiry, AND: [{ OR: documentScope }] };
    const [live, permissions, shares]: any[][] = await Promise.all([
      scope.length ? db.effectiveAccessGrant?.findMany?.({ where: { canView: true, OR: scope },
        select: { documentId: true, directoryId: true } }) ?? [] : [],
      documentScope.length ? db.documentPermission?.findMany?.({ where: legacyScope, select: { documentId: true } }) ?? [] : [],
      documentScope.length ? db.documentShare?.findMany?.({ where: { ...legacyScope, revokedAt: null }, select: { documentId: true } }) ?? [] : [],
    ]);
    for (const grant of [...live, ...permissions, ...shares]) {
      if (grant.documentId != null) sharedDocuments.add(grant.documentId);
      if (grant.directoryId != null) sharedDirectories.add(grant.directoryId);
    }
  }
  for (const resource of resources) {
    const ownerId = kind === 'document' ? resource.uploadedById : resource.createdById;
    const reception = resource.receptionEnabled || resource.receptionOriginDirectoryId != null || resource.directory?.receptionEnabled;
    const location = kind === 'directory' ? resource.id : resource.directoryId;
    const ancestors = reception ? [] : edges.filter(e => e.descendantId === location && !e.ancestor.receptionEnabled);
    const applicable = reception ? [] : [...grants, ...legacy].filter(g =>
      (kind === 'document' && g.documentId === resource.id) || ancestors.some(e => e.ancestorId === g.directoryId));
    const ownershipSource = ancestors.find(e => e.ancestor.createdById === actorId)?.ancestorId ?? null;
    const publicFolders = ancestors.filter(e => e.ancestor.isPublic);
    const sharingSummary = { ...NO_SHARING };
    if (includeSharingSummary && actorId && !reception) {
      sharingSummary.direct = kind === 'document' ? sharedDocuments.has(resource.id) : sharedDirectories.has(resource.id);
      sharingSummary.inherited = ancestors.some(e => (kind === 'document' || e.ancestorId !== resource.id)
        && (e.ancestor.isPublic || sharedDirectories.has(e.ancestorId)));
      sharingSummary.public = resource.isPublic === true || publicFolders.length > 0;
      sharingSummary.shared = sharingSummary.direct || sharingSummary.inherited || sharingSummary.public;
    }
    const capabilities = reception ? { ...NO_ACCESS, owner: actorId === ownerId } : resolveAccess(ownerId, actorId,
      resource.isPublic === true || publicFolders.length > 0,
      [...applicable, ...(ownershipSource != null ? [FULL_ACCESS] : [])]);
    const provenance: any[] = applicable.map(g => ({
      grantId: g.id, userId: g.userId, grantedBy: grantors.find(u => u.id === g.grantedById) ?? { id: g.grantedById },
      sourceDirectory: g.directoryId == null ? null : ancestors.find(e => e.ancestorId === g.directoryId)?.ancestor,
      inherited: g.directoryId != null && (kind === 'document' || g.directoryId !== resource.id),
      parentGrantId: g.parentGrantId, expiresAt: g.expiresAt,
      legacy: g.legacy === true,
      authoritySource: { grantId: g.sourceGrantId ?? g.id,
        directory: ancestors.find(e => e.ancestorId === (g.sourceDirectoryId ?? g.directoryId))?.ancestor ?? null },
      ...Object.fromEntries(ACCESS_FLAGS.map(key => [key, g[key]])),
    }));
    for (const edge of publicFolders) provenance.push({
      grantId: null, userId: null, grantedBy: { id: edge.ancestor.createdById }, sourceDirectory: edge.ancestor,
      inherited: kind === 'document' || edge.ancestorId !== resource.id, parentGrantId: null, expiresAt: null,
      ...NO_ACCESS, canView: true, public: true,
    });
    if (!reception && resource.isPublic) provenance.push({ grantId: null, userId: null, grantedBy: { id: ownerId },
      sourceDirectory: null, inherited: false, public: true, ...NO_ACCESS, canView: true });
    if (!reception && ownershipSource != null && ownerId !== actorId) {
      provenance.push({ grantId: null, userId: actorId, grantedBy: { id: actorId },
        sourceDirectory: ancestors.find(e => e.ancestorId === ownershipSource)?.ancestor,
        inherited: true, ownership: true, ...FULL_ACCESS });
    }
    result.set(resource.id, { capabilities, provenance, grants: applicable, ownershipSource, sharingSummary });
  }
  return result;
}

export async function requireResourceAccess(db: any, resource: any, actorId: string, kind: 'document' | 'directory', capability: keyof AccessFlags) {
  const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { id: true } }) : null;
  if (!actor) throw new ForbiddenException('Identidad no disponible');
  const access = (await loadInheritedAccess(db, [resource], actorId, kind)).get(resource.id)!;
  if (!access.capabilities[capability]) throw new ForbiddenException('No tienes permiso para gestionar esta operación');
  return access;
}

export async function grantResourceAccess(db: any, resource: any, actorId: string, kind: 'document' | 'directory', input: ResourceSharingDto, grantId?: number) {
  const dto = plainToInstance(ResourceSharingDto, input);
  if (!input || validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length || dto.userId.trim() !== dto.userId) {
    throw new BadRequestException('Concesión inválida');
  }
  const ownerId = kind === 'document' ? resource.uploadedById : resource.createdById;
  if (dto.userId === actorId || dto.userId === ownerId) throw new BadRequestException('Destinatario inválido');
  const access = await requireResourceAccess(db, resource, actorId, kind, 'canShare');
  const recipient = await db.user.findUnique({ where: { id: dto.userId }, select: { id: true, lockedUntil: true } });
  if (!recipient || recipient.lockedUntil > new Date()) throw new BadRequestException('Destinatario no disponible');
  const flags = { canView: true, canEdit: dto.canEdit === true, canUploadVersion: dto.canUploadVersion === true, canShare: dto.canShare === true };
  assertGrantSubset(access.capabilities, flags);
  const parent = access.capabilities.owner || access.ownershipSource != null ? null : access.grants.find(g =>
    g.canShare && ACCESS_FLAGS.every(key => !flags[key] || g[key]));
  if (!access.capabilities.owner && access.ownershipSource == null && !parent) {
    throw new ForbiddenException('La concesión debe depender de una sola fuente vigente con todos los permisos solicitados');
  }
  let expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('La expiración debe ser futura');
  if (grantId !== undefined && (kind !== 'document' || !Number.isSafeInteger(grantId) || grantId < 1)) {
    throw new BadRequestException('Concesión inválida');
  }
  const existing = grantId === undefined ? await db.accessGrant.findFirst({ where: {
    [kind === 'document' ? 'documentId' : 'directoryId']: resource.id,
    userId: dto.userId, grantedById: actorId, revokedAt: null,
  } }) : await db.accessGrant.findUnique({ where: { id: grantId } });
  if (grantId !== undefined) {
    if (!existing || existing.documentId !== resource.id || existing.userId !== dto.userId || existing.revokedAt != null) {
      throw new NotFoundException('Concesión no encontrada');
    }
    if (!access.capabilities.owner && existing.grantedById !== actorId) {
      throw new ForbiddenException('No puedes modificar concesiones de otros usuarios');
    }
    const live = await db.effectiveAccessGrant.findMany({
      where: { id: grantId, documentId: resource.id, userId: dto.userId }, select: { id: true },
    });
    if (!live.some(grant => grant.id === grantId)) {
      throw new ForbiddenException('La concesión ya no está vigente');
    }
    if (dto.expiresAt === undefined) expiresAt = existing.expiresAt ?? null;
  }
  // El propietario conserva la fuente y el otorgante de una concesión ajena.
  if (grantId !== undefined && existing.grantedById !== actorId) {
    return db.accessGrant.update({ where: { id: existing.id }, data: { ...flags, expiresAt } });
  }
  const data = {
    ...flags, expiresAt, parentGrantId: parent?.id ?? null,
    authorityDirectoryId: access.capabilities.owner ? null : access.ownershipSource,
  };
  return existing ? db.accessGrant.update({ where: { id: existing.id }, data }) : db.accessGrant.create({ data: {
    ...data, [kind === 'document' ? 'documentId' : 'directoryId']: resource.id, userId: dto.userId, grantedById: actorId,
  } });
}

export async function revokeResourceGrant(db: any, resource: any, actorId: string, kind: 'document' | 'directory', grantId: number) {
  const grant = await db.accessGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant[kind === 'document' ? 'documentId' : 'directoryId'] !== resource.id) throw new NotFoundException('Concesión no encontrada');
  const ownerId = kind === 'document' ? resource.uploadedById : resource.createdById;
  if (ownerId !== actorId && grant.grantedById !== actorId) throw new ForbiddenException('No puedes revocar concesiones de otros usuarios');
  await db.accessGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
  return { revoked: true, independentAccessMayRemain: true };
}

export async function resourceSharing(db: any, resource: any, actorId: string, kind: 'document' | 'directory') {
  const access = await requireResourceAccess(db, resource, actorId, kind, 'canView');
  const where = { [kind === 'document' ? 'documentId' : 'directoryId']: resource.id, revokedAt: null,
    ...(!access.capabilities.owner ? { OR: [{ userId: actorId }, { grantedById: actorId }] } : {}),
  };
  const recipients = await db.accessGrant.findMany({ where, include: {
    user: { select: { id: true, name: true, email: true } },
    grantedBy: { select: { id: true, name: true, email: true } },
  }, orderBy: { id: 'asc' } });
  const live = await db.effectiveAccessGrant.findMany({ where: { id: { in: recipients.map(g => g.id) } }, select: { id: true, sourceGrantId: true, sourceDirectoryId: true } });
  const location = kind === 'directory' ? resource.id : resource.directoryId;
  const edges: any[] = location != null && db.directoryAncestor ? await db.directoryAncestor.findMany({
    where: { descendantId: location }, include: { ancestor: { select: { id: true, name: true, createdById: true, receptionEnabled: true } } },
  }) : [];
  const sourceIds = edges.filter(e => !e.ancestor.receptionEnabled && (kind === 'document' || e.ancestorId !== resource.id)).map(e => e.ancestorId);
  const inheritedGrants: any[] = sourceIds.length ? await db.accessGrant.findMany({ where: {
    directoryId: { in: sourceIds }, revokedAt: null,
    ...(!access.capabilities.owner ? { OR: [{ userId: actorId }, { grantedById: actorId }] } : {}),
  }, include: { user: { select: { id: true, name: true, email: true } }, grantedBy: { select: { id: true, name: true, email: true } } } }) : [];
  const inheritedLive: any[] = inheritedGrants.length ? await db.effectiveAccessGrant.findMany({ where: { id: { in: inheritedGrants.map(g => g.id) } }, select: { id: true } }) : [];
  const legacyRecipients: any[] = kind === 'document' && access.capabilities.owner ? (await Promise.all([
    db.documentPermission?.findMany?.({ where: { documentId: resource.id, canView: true, userId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      include: { user: { select: { id: true, name: true, email: true } }, grantedBy: { select: { id: true, name: true, email: true } } } }) ?? [],
    db.documentShare?.findMany?.({ where: { documentId: resource.id, canView: true, revokedAt: null, userId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      include: { user: { select: { id: true, name: true, email: true } }, sharedBy: { select: { id: true, name: true, email: true } } } }) ?? [],
  ])).flat() : [];
  return {
    [kind === 'document' ? 'documentId' : 'directoryId']: resource.id,
    isPublic: resource.isPublic === true, capabilities: access.capabilities,
    canManageSharing: access.capabilities.canShare, canSetVisibility: access.capabilities.owner,
    provenance: access.provenance,
    recipients: [...new Map([...recipients.filter(g => live.some(l => l.id === g.id)), ...legacyRecipients].filter(g => g.user).map(g => [g.user.id, g.user])).values()],
    legacyGrants: legacyRecipients.map(g => ({ id: g.id, user: g.user, grantedBy: g.grantedBy ?? g.sharedBy,
      legacy: true, ...NO_ACCESS, canView: true, expiresAt: g.expiresAt })),
    inheritedGrants: inheritedGrants.map(g => ({ ...g, inherited: true, canRevoke: false,
      effective: inheritedLive.some(l => l.id === g.id), sourceDirectory: edges.find(e => e.ancestorId === g.directoryId)?.ancestor })),
    grants: recipients.map(g => ({ ...g, effective: live.some(l => l.id === g.id), canRevoke: access.capabilities.owner || g.grantedById === actorId,
      authoritySource: { grantId: live.find(l => l.id === g.id)?.sourceGrantId ?? g.id,
        directory: edges.find(e => e.ancestorId === live.find(l => l.id === g.id)?.sourceDirectoryId)?.ancestor ?? null },
    })),
  };
}
