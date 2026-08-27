import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '../compatibility/authorization.service';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const permissions = Array.isArray(required) ? required : [required];
    const user = context.switchToHttp().getRequest().user;
    if (!user?.id || !(await this.hasAnyPermission(user.id, permissions))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }

  private async hasAnyPermission(userId: string, permissions: string[]) {
    for (const permission of permissions) {
      if (await this.authorization.hasPermission(userId, permission)) return true;
    }
    return false;
  }
}
