import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthorizationService } from '../compatibility/authorization.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();

    if (!user?.id) return false;
    const authorization = await this.authorization.getAuthorization(user.id);
    return requiredRoles.some((role) => authorization.roles.includes(role));
  }
}
