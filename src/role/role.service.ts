import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateRoleInput {
  name: string;
  description?: string;
  permissionActions: string[];
}

@Injectable()
export class RoleService {
  private cache: Map<string, string[]> = new Map();

  constructor(private prisma: PrismaService) {}

  async getRolePermissions(roleId: string): Promise<string[]> {
    if (this.cache.has(roleId)) {
      return this.cache.get(roleId)!;
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });

    if (!role) {
      return [];
    }

    const permissions = role.permissions.map((p) => p.action);
    this.cache.set(roleId, permissions);
    return permissions;
  }

  clearCache(roleId?: string) {
    if (roleId) {
      this.cache.delete(roleId);
    } else {
      this.cache.clear();
    }
  }

  async findAllRoles() {
    return this.prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: 'asc' },
    });
  }

  async createRole(input: CreateRoleInput) {
    const permissions = await this.prisma.permission.findMany({
      where: {
        action: {
          in: input.permissionActions,
        },
      },
    });

    return this.prisma.role.create({
      data: {
        name: input.name,
        description: input.description,
        permissions: {
          connect: permissions.map((permission) => ({ id: permission.id })),
        },
      },
      include: { permissions: true },
    });
  }

  async assignRoleToUser(userId: string, roleId: string) {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
    });

    this.clearCache(roleId);
    return updatedUser;
  }
}
