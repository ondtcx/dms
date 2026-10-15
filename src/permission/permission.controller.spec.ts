import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PermissionController } from './permission.controller';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

describe('permission sharing routes', () => {
  it('restricts effective access listing to existing audit roles and passes only actor identity', () => {
    const method = PermissionController.prototype['getEffectiveAccess'];
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('documents/:id/effective-access');
    expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([UserRole.ADMIN, UserRole.RECTOR, UserRole.COORDINADOR]);
    const service: any = { getEffectiveAccess: jest.fn() };
    (new PermissionController(service) as any).getEffectiveAccess(2, { user: { id: 'actor' } }, 'cursor');
    expect(service.getEffectiveAccess).toHaveBeenCalledWith(2, 'actor', 'cursor');
  });
  it('requires authentication on all routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PermissionController)).toContain(AuthGuard);
  });
  it.each([
    ['getSharing', 'documents/:id/sharing'],
    ['searchRecipients', 'documents/:id/sharing/recipients'],
    ['grantRead', 'documents/:id/sharing'],
    ['revokeRead', 'documents/:id/sharing/recipients/:userId'],
    ['setVisibility', 'documents/:id/sharing/visibility'],
  ])('keeps stable path %s', (method, path) => expect(Reflect.getMetadata(PATH_METADATA, PermissionController.prototype[method])).toBe(path));
  it('passes authenticated identity to legacy revoke and list', () => {
    const service: any = { revokeDocumentPermission: jest.fn(), getDocumentPermissions: jest.fn() };
    const controller = new PermissionController(service);
    controller.revokeDocumentPermission(2, { user: { id: 'actor' } });
    controller.getDocumentPermissions(3, { user: { id: 'actor' } });
    expect(service.revokeDocumentPermission).toHaveBeenCalledWith(2, 'actor');
    expect(service.getDocumentPermissions).toHaveBeenCalledWith(3, 'actor');
  });
});
