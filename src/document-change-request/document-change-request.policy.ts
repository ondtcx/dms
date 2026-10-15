import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { resolveEffectiveRoleKeys } from '../role/compatibility-resolver';
import { UserRole } from '../auth/role.enum';

export const changeRequestActorSelect = {
  id: true, role: true, lockedUntil: true,
  roleAssignments: { where: { role: { isActive: true } }, select: { role: { select: { key: true, isActive: true } } } },
} as const;

export function canManageChangeRequests(document: any, actor: any): boolean {
  return Boolean(document && actor && (document.uploadedById === actor.id ||
    resolveEffectiveRoleKeys(actor.role, (actor.roleAssignments ?? []).map(({ role }) => role)).includes(UserRole.ADMIN)));
}

export function assertChangeRequestManager(document: any, actor: any): void {
  if (!actor || actor.lockedUntil > new Date()) throw new ForbiddenException('Identidad no disponible');
  if (!canManageChangeRequests(document, actor)) throw new ForbiddenException('Solo el propietario o ADMIN puede gestionar solicitudes de cambios');
}

// El flujo independiente no sustituye la recepción ni las transiciones de workflow.
export async function assertChangeRequestDocument(db: any, document: any) {
  if (!document || document.deletedAt || document.archivedAt) throw new NotFoundException('Documento no disponible');
  if (document.receptionOriginDirectoryId != null || document.directory?.receptionEnabled) {
    throw new ForbiddenException('Las solicitudes independientes no están disponibles en recepción');
  }
  if (await db.documentWorkflow.findFirst({ where: { documentId: document.id, active: true,
    status: { in: ['PENDING', 'IN_PROGRESS', 'CHANGES_REQUESTED'] } }, select: { id: true } })) {
    throw new ForbiddenException('El documento tiene un workflow activo');
  }
}
