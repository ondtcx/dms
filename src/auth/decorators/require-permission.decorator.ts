import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator para requerir permisos específicos en un endpoint
 *
 * @example
 * @RequirePermission('documents.create')
 * @RequirePermission('documents.create', 'documents.edit')
 *
 * Nota: El usuario debe tener TODOS los permisos especificados
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
