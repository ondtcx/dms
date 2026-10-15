import { BadRequestException } from '@nestjs/common';

export function sharingComment(value?: string): string | undefined {
  if (value !== undefined && (typeof value !== 'string' || value.length > 2000)) {
    throw new BadRequestException('El comentario debe ser texto de hasta 2000 caracteres');
  }
  return value?.trim() || undefined;
}

// El llamador pasa la misma transacción de la concesión. Un fallo revierte ambas escrituras.
export async function notifySharingGrant(db: any, kind: 'document' | 'directory', resource: any,
  recipientId: string, previous: any, granted: any, comment?: string) {
  const text = sharingComment(comment);
  const same = previous && previous.revokedAt == null &&
    (!previous.expiresAt || new Date(previous.expiresAt) > new Date()) &&
    ['canView', 'canEdit', 'canUploadVersion', 'canShare'].every(key => previous[key] === granted[key]) &&
    (previous.expiresAt ? new Date(previous.expiresAt).getTime() : null) ===
    (granted.expiresAt ? new Date(granted.expiresAt).getTime() : null);
  if (same) return;
  await db.notification.create({ data: {
    userId: recipientId, type: 'DOCUMENT_SHARED',
    title: kind === 'document' ? 'Documento compartido contigo' : 'Carpeta compartida contigo',
    message: `${resource.name || (kind === 'document' ? 'Documento' : 'Carpeta')}${text ? `\n${text}` : ''}`,
    documentId: kind === 'document' ? resource.id : null,
    actionUrl: kind === 'document' ? `/dashboard/documents/${resource.id}` : `/dashboard/directories?directoryId=${resource.id}`,
  } });
}
