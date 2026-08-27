import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveEffectiveRoleKeys } from '../../role/compatibility-resolver';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthorization(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                key: true,
                isActive: true,
                permissions: {
                  where: { permission: { isActive: true } },
                  select: { permission: { select: { key: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return { roles: [], permissions: [] };
    const roles = resolveEffectiveRoleKeys(user.role, user.roleAssignments.map((a) => a.role));
    const permissions = new Set<string>();
    for (const assignment of user.roleAssignments) {
      for (const item of assignment.role.permissions) permissions.add(item.permission.key);
    }
    if (roles.includes('admin')) permissions.add('roles.manage');
    return { roles, permissions: [...permissions] };
  }

  async hasPermission(userId: string, permission: string) {
    const authorization = await this.getAuthorization(userId);
    return authorization.permissions.includes(permission);
  }
}
