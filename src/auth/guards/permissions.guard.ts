import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionService } from '../../permission/permission.service';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../role.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Obtener el request
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Primero verificar roles (comportamiento del RolesGuard original)
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles) {
      const hasRole = requiredRoles.some((role) => user.role === role);
      if (!hasRole) {
        return false;
      }
    }

    // Luego verificar permisos específicos
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      // Si no hay permisos requeridos, solo importa el rol (o ninguna restricción)
      return requiredRoles ? true : true;
    }

    // ADMIN siempre tiene acceso
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Verificar cada permiso requerido
    const permissionChecks = await Promise.all(
      requiredPermissions.map((permission) =>
        this.permissionService.checkUserHasPermission(user.id, permission),
      ),
    );

    // El usuario debe tener TODOS los permisos requeridos
    return permissionChecks.every((hasPermission) => hasPermission === true);
  }
}
