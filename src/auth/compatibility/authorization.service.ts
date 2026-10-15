import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveEffectiveRoleKeys } from '../../role/compatibility-resolver';

export type AuthorizationProfile = {
  user: Omit<User, 'password'>;
  roles: string[];
  permissions: string[];
  authRevision: number;
};

export type AuthorizationProjection = Omit<AuthorizationProfile, 'user'>;

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  // La lectura de autoridad puede ejecutarse dentro del mismo cliente de
  // transacción Serializable para que la concesión vigente forme parte de la
  // decisión. Por defecto usa la conexión raíz y conserva los llamadores previos.
  async getAuthorization(
    userId: string,
    db: Prisma.TransactionClient = this.prisma as unknown as Prisma.TransactionClient,
  ): Promise<AuthorizationProjection> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        authRevision: true,
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

    if (!user) return { roles: [], permissions: [], authRevision: 0 };
    const roles = resolveEffectiveRoleKeys(user.role, user.roleAssignments.map((a) => a.role));
    const permissions = new Set<string>();
    for (const assignment of user.roleAssignments) {
      for (const item of assignment.role.permissions) permissions.add(item.permission.key);
    }
    if (roles.includes('admin')) permissions.add('roles.manage');
    return { roles, permissions: [...permissions], authRevision: user.authRevision };
  }

  async hasPermission(userId: string, permission: string, db?: Prisma.TransactionClient) {
    const authorization = await this.getAuthorization(userId, db);
    return authorization.permissions.includes(permission);
  }
}
