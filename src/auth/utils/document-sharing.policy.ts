import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { resolveEffectiveRoleKeys } from '../../role/compatibility-resolver';

export const sharingManagerSelect = {
  id: true, role: true,
  roleAssignments: {
    where: { role: { isActive: true } },
    select: { role: { select: { key: true, isActive: true } } },
  },
} as const;

export function isSharingAdmin(user: any): boolean {
  return !!user && resolveEffectiveRoleKeys(user.role, (user.roleAssignments ?? []).map(({ role }) => role)).includes('admin');
}

export function canManageDocumentSharing(document: {
  uploadedById: string;
  deletedAt?: Date | null;
  receptionOriginDirectoryId?: number | null;
  directory?: { receptionEnabled: boolean } | null;
}, user: any): boolean {
  // El origen conserva la privacidad aunque el documento salga de la carpeta.
  if (document.receptionOriginDirectoryId != null || document.directory?.receptionEnabled) return false;
  return !!user && !document.deletedAt && document.uploadedById === user.id;
}

export async function assertSharingDocumentAvailable(prisma: any, document: any): Promise<void> {
  if (!document || document.deletedAt) throw new NotFoundException('Documento no encontrado');
  const store = prisma.workflowResidueCandidate;
  if (store?.findMany) {
    const candidates = await store.findMany({
      where: { rootType: 'DOCUMENT', state: 'QUARANTINED' }, select: { rootId: true },
    });
    if ((candidates ?? []).some((item) => Number(item.rootId) === document.id)) {
      throw new NotFoundException('Documento no encontrado');
    }
  }
}

export function assertSharingManager(document: any, user: any): void {
  if (!canManageDocumentSharing(document, user)) {
    throw new ForbiddenException('No tienes permiso para gestionar el acceso a este documento');
  }
}
