import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { key: 'asc' },
    }).then((roles) => roles.map((role) => ({
      ...role,
      assignmentCount: role._count.assignments,
    })));
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.prisma.role.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('Role key already exists');
    return this.prisma.$transaction(async (tx) => {
      const permissions = await this.resolvePermissions(tx, dto.permissionKeys ?? []);
      const role = await tx.role.create({ data: { key: dto.key, label: dto.label, isActive: dto.isActive ?? true } });
      await this.writePermissions(tx, role.id, permissions);
      return tx.role.findUniqueOrThrow({ where: { id: role.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(id: number, dto: Partial<Omit<CreateRoleDto, 'key'>>) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.role.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Role not found');
      const permissions = dto.permissionKeys === undefined ? undefined : await this.resolvePermissions(tx, dto.permissionKeys);
      const role = await tx.role.update({
        where: { id },
        data: { label: dto.label, isActive: dto.isActive },
      });
      if (dto.permissionKeys) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await this.writePermissions(tx, id, permissions);
      }
      await this.bumpRoleUsers(tx, id);
      if (dto.isActive === false || dto.permissionKeys) await this.assertAuthorityRemains(tx);
      return role;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deactivate(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundException('Role not found');
      await tx.role.update({ where: { id }, data: { isActive: false } });
      await this.bumpRoleUsers(tx, id);
      await this.assertAuthorityRemains(tx);
      return { ...role, isActive: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assign(id: number, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role || !role.isActive) throw new ForbiddenException('Inactive role cannot be assigned');
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      const existing = await tx.userRoleAssignment.findUnique({ where: { userId_roleId: { userId, roleId: id } } });
      if (existing) throw new ConflictException('Role is already assigned');
      const assignment = await tx.userRoleAssignment.create({ data: { roleId: id, userId } });
      await this.bumpUser(tx, userId);
      return this.currentUserProjection(tx, userId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeAssignment(id: number, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.delete({ where: { userId_roleId: { userId, roleId: id } } });
      await this.bumpUser(tx, userId);
      await this.assertAuthorityRemains(tx);
      return this.currentUserProjection(tx, userId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async resolvePermissions(tx: any, keys: string[]) {
    if (new Set(keys).size !== keys.length) throw new ConflictException('Duplicate permissions are not allowed');
    if (!keys.length) return [];
    const permissions = await tx.permission.findMany({ where: { key: { in: keys }, isActive: true } });
    if (permissions.length !== keys.length) throw new NotFoundException('Permission not found');
    return permissions;
  }

  private async writePermissions(tx: any, roleId: number, permissions: Array<{ id: number }>) {
    if (permissions.length) {
      await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId, permissionId: p.id })) });
    }
  }

  private async bumpUser(tx: any, userId: string) {
    await tx.user.update({ where: { id: userId }, data: { authRevision: { increment: 1 } } });
  }

  private async bumpRoleUsers(tx: any, roleId: number) {
    await tx.user.updateMany({
      where: { roleAssignments: { some: { roleId } } },
      data: { authRevision: { increment: 1 } },
    });
  }

  private currentUserProjection(tx: any, userId: string) {
    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRevision: true,
        roleAssignments: {
          select: { role: { select: { id: true, key: true, label: true, isActive: true } } },
        },
      },
    }).then((user: any) => {
      const { roleAssignments, ...projection } = user;
      return { ...projection, catalogRoles: roleAssignments.map(({ role }: any) => role) };
    });
  }

  private async assertAuthorityRemains(tx: any) {
    const authorities = await tx.user.count({
      where: {
        roleAssignments: {
          some: {
            role: {
              isActive: true,
              permissions: { some: { permission: { key: 'roles.manage', isActive: true } } },
            },
          },
        },
      },
    });
    if (authorities < 1) throw new ForbiddenException('At least one roles.manage authority must remain active');
  }
}
