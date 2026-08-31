import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '../auth/role.enum';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectoryDto } from './dto/create-directory.dto';
import { UpdateDirectoryDto } from './dto/update-directory.dto';

type DirectoryUser = { id: string; role: UserRole };

const PRIVILEGED_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.RECTOR,
  UserRole.VICERRECTOR,
]);

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findChildren(parentId: number | undefined, user: DirectoryUser) {
    if (parentId !== undefined) await this.assertDiscoverable(parentId, user);
    const visibleIds = await this.getDiscoverableIds(user);
    const children = await this.prisma.directory.findMany({
      where: {
        parentId: parentId ?? null,
        id: { in: [...visibleIds] },
      },
      orderBy: { name: 'asc' },
    });
    return children;
  }

  async getBreadcrumb(id: number, user: DirectoryUser) {
    await this.assertDiscoverable(id, user);
    const breadcrumb = [];
    let currentId: number | null = id;
    while (currentId !== null) {
      const directory = await this.prisma.directory.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
      if (!directory) break;
      breadcrumb.unshift(directory);
      currentId = directory.parentId;
    }
    return breadcrumb;
  }

  async getNavigationSummary(user: DirectoryUser) {
    const discoverableIds = await this.getDiscoverableIds(user);
    const [recent, mostUsed] = await Promise.all([
      this.getUsageDirectories(user, discoverableIds, [{ lastAccessedAt: 'desc' }]),
      this.getUsageDirectories(user, discoverableIds, [{ accessCount: 'desc' }, { lastAccessedAt: 'desc' }]),
    ]);
    return { recent, mostUsed };
  }

  async getAccessibleDirectories(page: number | undefined, limit: number | undefined, user: DirectoryUser) {
    const resolvedPage = page ?? 1;
    const resolvedLimit = limit ?? 50;
    if (!Number.isInteger(resolvedPage) || resolvedPage < 1) {
      throw new BadRequestException('La página debe ser un entero mayor o igual a 1');
    }
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > 100) {
      throw new BadRequestException('El límite debe estar entre 1 y 100');
    }

    const ids = [...(await this.getDiscoverableIds(user))];
    const total = ids.length;
    const data = await this.prisma.directory.findMany({
      where: { id: { in: ids } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (resolvedPage - 1) * resolvedLimit,
      take: resolvedLimit,
    });
    return {
      data,
      meta: { page: resolvedPage, limit: resolvedLimit, total, totalPages: Math.ceil(total / resolvedLimit) },
    };
  }

  private async getUsageDirectories(user: DirectoryUser, discoverableIds: Set<number>, orderBy: any[]) {
    if (!discoverableIds.size) return [];
    const usage = await this.prisma.userDirectoryUsage.findMany({
      where: { userId: user.id, directoryId: { in: [...discoverableIds] } },
      orderBy,
      take: 5,
      include: { directory: true },
    });
    return usage.map((entry: any) => entry.directory).filter(Boolean);
  }

  async create(dto: CreateDirectoryDto, user: DirectoryUser) {
    const name = this.normalizeName(dto.name);
    if (dto.parentId !== undefined && dto.parentId !== null) await this.assertDiscoverable(dto.parentId, user);
    try {
      return await this.prisma.directory.create({
        data: { name, nameNormalized: this.normalizeKey(name), parentId: dto.parentId ?? null, createdById: user.id },
      });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async update(id: number, dto: UpdateDirectoryDto, user: DirectoryUser) {
    const current = await this.getForManagement(id, user);
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId;
    if (parentId !== null && parentId !== undefined) await this.assertDiscoverable(parentId, user);
    if (parentId === id || (parentId !== null && await this.isDescendant(id, parentId))) {
      throw new ConflictException('No se puede crear un ciclo en la jerarquía');
    }
    const name = dto.name === undefined ? current.name : this.normalizeName(dto.name);
    try {
      return await this.prisma.directory.update({
        where: { id },
        data: { name, nameNormalized: this.normalizeKey(name), parentId },
      });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async remove(id: number, user: DirectoryUser) {
    await this.getForManagement(id, user);
    const [children, documents] = await Promise.all([
      this.prisma.directory.count({ where: { parentId: id } }),
      this.prisma.document.count({ where: { directoryId: id } }),
    ]);
    if (children > 0 || documents > 0) {
      throw new ConflictException('Solo se pueden eliminar directorios vacíos');
    }
    try {
      return await this.prisma.directory.delete({ where: { id } });
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async recordVisit(directoryId: number, eventId: string, user: DirectoryUser) {
    return this.prisma.$transaction(async (tx: any) => {
      const existingEvent = await tx.directoryNavigationEvent.findUnique({
        where: { userId_eventId: { userId: user.id, eventId } },
        select: { directoryId: true },
      });

      if (existingEvent) {
        if (existingEvent.directoryId !== directoryId) {
          throw new BadRequestException('El evento de navegación ya fue utilizado para otro directorio');
        }
        await this.assertDiscoverable(directoryId, user, tx);
        return;
      }

      await this.assertDiscoverable(directoryId, user, tx);
      await tx.directoryNavigationEvent.create({
        data: { userId: user.id, directoryId, eventId },
      });
      await tx.userDirectoryUsage.upsert({
        where: { userId_directoryId: { userId: user.id, directoryId } },
        create: { userId: user.id, directoryId, accessCount: 1 },
        update: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      });
    });
  }

  private async getForManagement(id: number, user: DirectoryUser) {
    const directory = await this.prisma.directory.findUnique({ where: { id } });
    if (!directory || !(await this.isDiscoverable(directory, user, this.prisma))) {
      throw new NotFoundException('Directorio no encontrado');
    }
    if (directory.createdById !== user.id && !PRIVILEGED_ROLES.has(user.role)) {
      throw new ForbiddenException('No tienes permiso para administrar este directorio');
    }
    return directory;
  }

  async assertDiscoverable(id: number, user: DirectoryUser, db: any = this.prisma) {
    const directory = await db.directory.findUnique({ where: { id } });
    if (!directory || !(await this.isDiscoverable(directory, user, db))) {
      throw new NotFoundException('Directorio no encontrado');
    }
    return directory;
  }

  private async isDiscoverable(directory: { id: number; createdById: string }, user: DirectoryUser, db: any) {
    if (directory.createdById === user.id || PRIVILEGED_ROLES.has(user.role)) return true;
    const visibleIds = await this.getDiscoverableIds(user, db);
    return visibleIds.has(directory.id);
  }

  private async getDiscoverableIds(user: DirectoryUser, db: any = this.prisma): Promise<Set<number>> {
    if (PRIVILEGED_ROLES.has(user.role)) {
      const all = await db.directory.findMany({ select: { id: true } });
      return new Set(all.map(({ id }) => id));
    }
    const access = buildDocumentAccessFilter(user);
    const documents = await db.document.findMany({
      where: { ...(access ?? {}), directoryId: { not: null } },
      select: { directoryId: true },
    });
    const ids = new Set<number>(documents.map((document) => document.directoryId).filter((id): id is number => id !== null));
    let pending = [...ids];
    while (pending.length) {
      const parents = await db.directory.findMany({
        where: { id: { in: pending } },
        select: { id: true, parentId: true },
      });
      const next: number[] = [];
      for (const parent of parents) {
        if (parent.parentId !== null && !ids.has(parent.parentId)) {
          ids.add(parent.parentId);
          next.push(parent.parentId);
        }
      }
      pending = next;
    }
    const owned = await db.directory.findMany({ where: { createdById: user.id }, select: { id: true } });
    owned.forEach(({ id }) => ids.add(id));
    return ids;
  }

  private async isDescendant(ancestorId: number, candidateId: number) {
    let currentId: number | null = candidateId;
    while (currentId !== null) {
      const current = await this.prisma.directory.findUnique({ where: { id: currentId }, select: { parentId: true } });
      if (!current) return false;
      if (current.parentId === ancestorId) return true;
      currentId = current.parentId;
    }
    return false;
  }

  private normalizeName(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('El nombre del directorio no puede estar vacío');
    return normalized;
  }

  private normalizeKey(name: string) {
    return name.toLocaleLowerCase();
  }

  private rethrowConstraint(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError || (error as any)?.code) {
      const code = (error as Prisma.PrismaClientKnownRequestError).code;
      if (!['P2002', 'P2003'].includes(code)) throw error;
      throw new ConflictException('Ya existe un directorio con ese nombre en este nivel');
    }
    throw error;
  }
}
