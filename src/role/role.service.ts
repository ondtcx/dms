import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { key: 'asc' },
    });
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.prisma.role.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('Role key already exists');
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { key: dto.key, label: dto.label, isActive: dto.isActive ?? true } });
      await this.replacePermissions(tx, role.id, dto.permissionKeys ?? []);
      return tx.role.findUniqueOrThrow({ where: { id: role.id } });
    });
  }

  async update(id: number, dto: Partial<CreateRoleDto>) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({ where: { id }, data: { label: dto.label, isActive: dto.isActive } });
      if (dto.permissionKeys) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await this.replacePermissions(tx, id, dto.permissionKeys);
      }
      if (dto.isActive === false) await this.assertAdministratorRemains(tx);
      return role;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async deactivate(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw new NotFoundException('Role not found');
      await tx.role.update({ where: { id }, data: { isActive: false } });
      await this.assertAdministratorRemains(tx);
      return { ...role, isActive: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assign(id: number, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role || !role.isActive) throw new ForbiddenException('Inactive role cannot be assigned');
      return tx.userRoleAssignment.create({ data: { roleId: id, userId } });
    });
  }

  async removeAssignment(id: number, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.delete({ where: { userId_roleId: { userId, roleId: id } } });
      await this.assertAdministratorRemains(tx);
      return { removed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async replacePermissions(tx: any, roleId: number, keys: string[]) {
    if (!keys.length) return;
    const permissions = await tx.permission.findMany({ where: { key: { in: keys }, isActive: true } });
    if (permissions.length !== keys.length) throw new NotFoundException('Permission not found');
    await tx.rolePermission.createMany({ data: permissions.map((p: { id: number }) => ({ roleId, permissionId: p.id })) });
  }

  private async assertAdministratorRemains(tx: any) {
    const administrators = await tx.user.count({
      where: {
        OR: [
          { role: 'admin' },
          { roleAssignments: { some: { role: { isActive: true, key: 'admin' } } } },
        ],
      },
    });
    if (administrators < 1) throw new ForbiddenException('At least one administrator must remain active');
  }
}
