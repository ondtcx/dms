import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';
import { UserRole } from '../auth/role.enum';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // ============ Búsqueda Full-Text Principal ============

  async search(userId: string, searchDto: SearchQueryDto) {
    const {
      query,
      categoryIds,
      sectionIds,
      departmentIds,
      courseIds,
      subjectIds,
      uploadedById,
      dateFrom,
      dateTo,
      minSize,
      maxSize,
      mimetypes,
      isPublic,
      includeDeleted = false,
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'desc',
    } = searchDto;

    // Cargar usuario con departmentId para el filtro de acceso
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role as unknown as UserRole,
        })
      : null;

    // Construir condiciones WHERE base
    const baseWhere: any = {};

    // IDs de documentos que hacen match con la búsqueda full-text (PostgreSQL tsvector via raw)
    let ftsIds: number[] | null = null;
    if (query && query.trim()) {
      const tsquery = query
        .trim()
        .split(/\s+/)
        .map((term) => term.replace(/[&|!():<>*'"\\]/g, ''))
        .filter((term) => term.length > 0)
        .map((term) => `${term}:*`)
        .join(' & ');

      if (tsquery) {
        const rows = await this.prisma.$queryRaw<
          { id: number; rank: number }[]
        >`
          SELECT id, ts_rank("searchVector", to_tsquery('simple', ${tsquery})) AS rank
          FROM "Document"
          WHERE "searchVector" @@ to_tsquery('simple', ${tsquery})
            AND "deletedAt" IS NULL
          ORDER BY rank DESC
        `;
        ftsIds = rows.map((r) => Number(r.id));
      }
    }

    if (ftsIds !== null) {
      baseWhere.id = { in: ftsIds };
    }

    // Filtros de categoría
    if (categoryIds && categoryIds.length > 0) {
      baseWhere.categoryId = { in: categoryIds };
    }

    // Filtros de sección (via categoría — la sección se deriva de category.sectionId)
    if (sectionIds && sectionIds.length > 0) {
      baseWhere.category = { sectionId: { in: sectionIds } };
    }

    // Filtros organizacionales (acumulado en AND para no pisar otras cláusulas OR)
    if (departmentIds && departmentIds.length > 0) {
      baseWhere.AND = [
        ...(baseWhere.AND ?? []),
        {
          OR: [
            { course: { departmentId: { in: departmentIds } } },
            { uploadedBy: { departmentId: { in: departmentIds } } },
          ],
        },
      ];
    }

    if (courseIds && courseIds.length > 0) {
      baseWhere.courseId = { in: courseIds };
    }

    if (subjectIds && subjectIds.length > 0) {
      baseWhere.subjectId = { in: subjectIds };
    }

    // Filtro de usuario que subió
    if (uploadedById) {
      baseWhere.uploadedById = uploadedById;
    }

    // Filtros de fecha
    if (dateFrom || dateTo) {
      baseWhere.createdAt = {};
      if (dateFrom) {
        baseWhere.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        baseWhere.createdAt.lte = new Date(dateTo);
      }
    }

    // Filtros de tamaño
    if (minSize || maxSize) {
      baseWhere.size = {};
      if (minSize) {
        baseWhere.size.gte = minSize;
      }
      if (maxSize) {
        baseWhere.size.lte = maxSize;
      }
    }

    // Filtro de tipo MIME
    if (mimetypes && mimetypes.length > 0) {
      baseWhere.mimetype = { in: mimetypes };
    }

    // Filtro de visibilidad
    if (isPublic !== undefined) {
      baseWhere.isPublic = isPublic;
    }

    // Filtro de eliminados
    if (!includeDeleted) {
      baseWhere.deletedAt = null;
    }

    // Combinar filtros base con el filtro de acceso (ReBAC)
    const where = accessFilter ? { AND: [baseWhere, accessFilter] } : baseWhere;

    // Construir ordenamiento
    // Cuando sortBy=relevance y hay FTS, los IDs ya vienen ordenados por ts_rank.
    // Prisma respetará ese orden si usamos: orderBy = [{ id: { sort: 'asc', nulls: 'last' } }]
    // pero no podemos ordenar por rank en findMany. En su lugar mantenemos el orden del array ftsIds
    // usando un campo estable como fallback (createdAt).
    let orderBy: any;
    if (sortBy === 'relevance' && ftsIds !== null) {
      // El orden de relevancia ya está en ftsIds (por ts_rank DESC).
      // Usamos createdAt desc como ordenamiento secundario para documentos con igual rank.
      orderBy = [{ createdAt: sortOrder }];
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Paginación
    const skip = (page - 1) * limit;
    const take = limit;

    const docInclude = {
      category: { select: { id: true, name: true, color: true, icon: true } },
      section: { select: { id: true, name: true, color: true, icon: true } },
      uploadedBy: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, name: true, code: true } },
      subject: { select: { id: true, name: true, code: true } },
      template: { select: { id: true, name: true } },
    };

    let documents: any[];
    let total: number;

    if (ftsIds !== null && sortBy === 'relevance') {
      // Los IDs ya están ordenados por ts_rank. Aplicamos los filtros adicionales en memoria
      // consultando todos los docs que pasan el where (sin el id: {in:} de FTS) y cruzando.
      // Para evitar una query gigante, filtramos el where a solo los IDs de la página y count aparte.

      // Total: contar cuántos ftsIds pasan los filtros adicionales (excluye el id:{in:ftsIds})
      const { id: _ignored, ...baseWithoutId } = baseWhere;
      const otherFilters = accessFilter
        ? { AND: [baseWithoutId, accessFilter] }
        : baseWithoutId;

      const passingIds =
        ftsIds.length > 0
          ? await this.prisma.document
              .findMany({
                where: { id: { in: ftsIds }, ...otherFilters },
                select: { id: true },
              })
              .then((rows) => new Set(rows.map((r) => r.id)))
          : new Set<number>();

      const orderedIds = ftsIds.filter((id) => passingIds.has(id));
      total = orderedIds.length;

      const pageIds = orderedIds.slice(skip, skip + take);
      const rawDocs =
        pageIds.length > 0
          ? await this.prisma.document.findMany({
              where: { id: { in: pageIds } },
              include: docInclude,
            })
          : [];

      // Restaurar el orden de relevancia
      const docMap = new Map(rawDocs.map((d) => [d.id, d]));
      documents = pageIds.map((id) => docMap.get(id)).filter(Boolean);
    } else {
      [documents, total] = await Promise.all([
        this.prisma.document.findMany({
          where,
          orderBy,
          skip,
          take,
          include: docInclude,
        }),
        this.prisma.document.count({ where }),
      ]);
    }

    // Guardar en historial de búsqueda (si hay query)
    if (query && query.trim()) {
      await this.saveSearchHistory(userId, query, searchDto, total);
    }

    return {
      data: documents,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  // ============ Sugerencias y Autocompletado ============

  async getSuggestions(userId: string, query: string, limit: number = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, departmentId: true },
    });

    const accessFilter = user
      ? buildDocumentAccessFilter({
          ...user,
          role: user.role as unknown as UserRole,
        })
      : null;

    const suggestions = await this.prisma.document.findMany({
      where: {
        OR: [
          { filename: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
        deletedAt: null,
        ...(accessFilter ?? {}),
      },
      select: { filename: true, description: true },
      take: limit,
      distinct: ['filename'],
    });

    const terms = new Set<string>();
    suggestions.forEach((doc) => {
      if (doc.filename) terms.add(doc.filename);
      if (doc.description) terms.add(doc.description);
    });

    return Array.from(terms).slice(0, limit);
  }

  // ============ Historial de Búsqueda ============

  private async saveSearchHistory(
    userId: string,
    query: string,
    filters: SearchQueryDto,
    resultCount: number,
  ) {
    // Guardar solo filtros relevantes (omitir paginación)
    const relevantFilters: any = {};
    if (filters.categoryIds) relevantFilters.categoryIds = filters.categoryIds;
    if (filters.sectionIds) relevantFilters.sectionIds = filters.sectionIds;
    if (filters.departmentIds)
      relevantFilters.departmentIds = filters.departmentIds;
    if (filters.courseIds) relevantFilters.courseIds = filters.courseIds;
    if (filters.subjectIds) relevantFilters.subjectIds = filters.subjectIds;
    if (filters.dateFrom) relevantFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) relevantFilters.dateTo = filters.dateTo;
    if (filters.minSize) relevantFilters.minSize = filters.minSize;
    if (filters.maxSize) relevantFilters.maxSize = filters.maxSize;
    if (filters.mimetypes) relevantFilters.mimetypes = filters.mimetypes;

    await this.prisma.searchHistory.create({
      data: {
        userId,
        query,
        filters: relevantFilters,
        resultCount,
      },
    });
  }

  async getSearchHistory(userId: string, limit: number = 20) {
    const safeLimit = Math.min(limit, 100);
    return this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      select: {
        id: true,
        query: true,
        filters: true,
        resultCount: true,
        createdAt: true,
      },
    });
  }

  async clearSearchHistory(userId: string) {
    await this.prisma.searchHistory.deleteMany({
      where: { userId },
    });

    return { message: 'Historial de búsqueda eliminado' };
  }

  // ============ Búsquedas Populares ============

  async getPopularSearches(userId: string, limit: number = 10) {
    const safeLimit = Math.min(limit, 50);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isPrivileged =
      user?.role === UserRole.ADMIN || user?.role === UserRole.DIRECTOR;

    // ADMIN y DIRECTOR ven búsquedas populares globales.
    // Otros roles solo ven las tendencias de sus propias búsquedas pasadas
    // para evitar exponer queries de documentos a los que no tienen acceso.
    const whereClause = {
      createdAt: { gte: thirtyDaysAgo },
      query: { not: '' },
      ...(isPrivileged ? {} : { userId }),
    };

    const popularSearches = await this.prisma.searchHistory.groupBy({
      by: ['query'],
      where: whereClause,
      _count: { query: true },
      orderBy: { _count: { query: 'desc' } },
      take: safeLimit,
    });

    return popularSearches.map((item) => ({
      query: item.query,
      count: item._count.query,
    }));
  }
}
