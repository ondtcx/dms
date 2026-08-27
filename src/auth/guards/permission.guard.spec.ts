import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequireAnyPermission } from '../decorators/permission.decorator';
import { PermissionGuard } from './permission.guard';

describe('PermissionGuard dynamic authorization', () => {
  class TestController {
    @RequireAnyPermission('users.manage', 'roles.manage')
    listUsers() {}
  }

  const context = (user: unknown): ExecutionContext => ({
    getHandler: () => TestController.prototype.listUsers,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext);

  it('accepts a dynamic roles.manage authority for the user listing policy', async () => {
    const guard = new PermissionGuard(
      new Reflector(),
      { hasPermission: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) } as any,
    );

    await expect(guard.canActivate(context({ id: 'dynamic-user' }))).resolves.toBe(true);
  });

  it('accepts the legacy users.manage authority and denies users without either authority', async () => {
    const authorization = { hasPermission: jest.fn().mockResolvedValue(true) };
    const guard = new PermissionGuard(new Reflector(), authorization as any);

    await expect(guard.canActivate(context({ id: 'legacy-user' }))).resolves.toBe(true);
    authorization.hasPermission.mockResolvedValue(false);
    await expect(guard.canActivate(context({ id: 'ordinary-user' }))).rejects.toThrow('Insufficient permissions');
  });
});
