import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { buildDocumentAccessFilter, buildReceptionReadSqlRestriction } from '../auth/utils/document-access.filter';
import { UserRole } from '../auth/role.enum';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // ============ Búsqueda Full-Text Principal ============

  async search(userId: string, searchDto: SearchQueryDto) {
    const {
      query,
      categoryIds,
      documentTypeIds,
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
      includeContent = false,
      page = 1,
      limit = 20,
      sortBy = 'relevance',
      sortOrder = 'desc',
    } = searchDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: { role: { select: { id: true, key: true, isActive: true } } },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const accessFilter = buildDocumentAccessFilter({
      ...user,
      role: user.role as unknown as UserRole,
      assignments: (user.roleAssignments ?? []).map(({ role }) => role),
    });

    // Construir condiciones WHERE base
    const baseWhere: Prisma.DocumentWhereInput = {};

    // Filtros de categoría
    if (categoryIds && categoryIds.length > 0) {
      baseWhere.categoryId = { in: categoryIds };
    }

    if (documentTypeIds && documentTypeIds.length > 0) {
      baseWhere.documentTypeId = { in: documentTypeIds };
    }

    if (courseIds && courseIds.length > 0) {
      baseWhere.academic = { courseId: { in: courseIds } };
    }

    if (subjectIds && subjectIds.length > 0) {
      baseWhere.academic = {
        ...(baseWhere.academic as Prisma.DocumentAcademicWhereInput),
        subjectId: { in: subjectIds },
      };
    }

    // Filtro de usuario que subió
    if (uploadedById) {
      baseWhere.uploadedById = uploadedById;
    }

    // Filtros de fecha
    if (dateFrom || dateTo) {
      const lowerBound = dateFrom ? new Date(dateFrom) : undefined;
      const upperBound = dateTo ? new Date(dateTo) : undefined;
      const isDateOnlyUpper = !!dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
      if (upperBound && isDateOnlyUpper) {
        // El día final completo se incluye hasta el siguiente inicio de día UTC.
        upperBound.setUTCDate(upperBound.getUTCDate() + 1);
      }
      if (lowerBound && upperBound && (
        isDateOnlyUpper ? lowerBound >= upperBound : lowerBound > upperBound
      )) {
        throw new BadRequestException('La fecha desde no puede ser posterior a la fecha hasta');
      }
      baseWhere.createdAt = {
        ...(lowerBound ? { gte: lowerBound } : {}),
        ...(upperBound ? (isDateOnlyUpper ? { lt: upperBound } : { lte: upperBound }) : {}),
      };
    }

    // Filtros de tamaño
    // Tamaño y MIME se filtran en SQL sobre la última versión.

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

    // Solo se materializan IDs autorizados; SQL ordena y pagina antes de cargar documentos.
    const skip = (page - 1) * limit;
    const take = limit;

    const docInclude: Prisma.DocumentInclude = {
      category: { select: { id: true, name: true, color: true, icon: true } },
      uploadedBy: { select: { id: true, name: true, email: true } },
      academic: { include: { course: true, subject: true } },
      templateData: { include: { template: { select: { id: true, name: true } } } },
      versions: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
    };

    const candidates = await this.prisma.document.findMany({ where, select: { id: true } });
    let documents = [];
    let total = 0;
    if (candidates.length) {
      const ids = Prisma.join(candidates.map(({ id }) => id));
      const text = query?.trim() ?? '';
      const metadataVector = Prisma.sql`(
        setweight(to_tsvector('spanish', COALESCE(d.name, '') || ' ' || COALESCE(v.filename, '') || ' ' || COALESCE(d."documentNumber", '')), 'A')
        || setweight(to_tsvector('spanish', COALESCE(d.description, '')), 'B')
      )`;
      const rank = text
        ? includeContent
          ? Prisma.sql`COALESCE(ts_rank(s."searchVector", plainto_tsquery('spanish', ${text})), 0)`
          : Prisma.sql`COALESCE(ts_rank(${metadataVector}, plainto_tsquery('spanish', ${text})), 0)`
        : Prisma.sql`0`;
      const columns = {
        relevance: text ? rank : Prisma.sql`d."createdAt"`,
        createdAt: Prisma.sql`d."createdAt"`,
        updatedAt: Prisma.sql`d."updatedAt"`,
        filename: Prisma.sql`v.filename`,
        size: Prisma.sql`v.size`,
      };
      const order = columns[sortBy] ?? columns.relevance;
      const direction = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const exactNumber = text
        ? Prisma.sql`(LOWER(d."documentNumber") = LOWER(${text})) DESC NULLS LAST, `
        : Prisma.sql``;
      const orderBy = sortBy === 'relevance'
        ? Prisma.sql`${exactNumber}${order} ${direction} NULLS LAST, d.id ASC`
        : Prisma.sql`${order} ${direction} NULLS LAST, d.id ASC`;
      const versionFilters = [Prisma.sql`TRUE`];
      if (text) {
        const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
        const alternatives = [
          Prisma.sql`d.description ILIKE ${pattern}`,
          Prisma.sql`d.name ILIKE ${pattern}`,
          Prisma.sql`v.filename ILIKE ${pattern}`,
          Prisma.sql`d."documentNumber" ILIKE ${pattern}`,
        ];
        if (includeContent) {
          alternatives.push(Prisma.sql`s."extractedText" ILIKE ${pattern}`);
          alternatives.push(Prisma.sql`s."searchVector" @@ plainto_tsquery('spanish', ${text})`);
        }
        versionFilters.push(Prisma.sql`(${Prisma.join(alternatives, ' OR ')})`);
      }
      if (minSize !== undefined) versionFilters.push(Prisma.sql`v.size >= ${minSize}`);
      if (maxSize !== undefined) versionFilters.push(Prisma.sql`v.size <= ${maxSize}`);
      if (mimetypes?.length) {
        versionFilters.push(Prisma.sql`(${Prisma.join(
          mimetypes.map((mime) => mime.endsWith('/')
            ? Prisma.sql`starts_with(v.mimetype, ${mime})`
            : Prisma.sql`v.mimetype = ${mime}`),
          ' OR ',
        )})`);
      }
      const selection = Prisma.sql`
        FROM "Document" d
        LEFT JOIN "DocumentSearch" s ON s."documentId" = d.id
        LEFT JOIN LATERAL (
          SELECT * FROM "DocumentVersion" WHERE "documentId" = d.id
          ORDER BY "createdAt" DESC, id DESC LIMIT 1
        ) v ON TRUE
        WHERE d.id IN (${ids}) AND ${buildReceptionReadSqlRestriction(userId)}
          AND ${Prisma.join(versionFilters, ' AND ')}
      `;
      const [rows, counts] = await Promise.all([
        this.prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
          SELECT d.id ${selection}
          ORDER BY ${orderBy}
          LIMIT ${take} OFFSET ${skip}
        `),
        this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${selection}`),
      ]);
      total = Number(counts[0].total);
      if (rows.length) {
        const rawDocs = await this.prisma.document.findMany({
          where: { AND: [where, { id: { in: rows.map(({ id }) => id) } }] },
          include: docInclude,
        });
        const docMap = new Map(rawDocs.map((doc) => [doc.id, doc]));
        documents = rows.map(({ id }) => docMap.get(id)).filter(Boolean);
      }
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
      select: { id: true, role: true },
    });

    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const accessFilter = buildDocumentAccessFilter({
      ...user,
      role: user.role as unknown as UserRole,
    });

    const suggestions = await this.prisma.document.findMany({
      where: {
        AND: [
          { OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { versions: { some: { filename: { contains: query, mode: 'insensitive' } } } },
            { description: { contains: query, mode: 'insensitive' } },
          ] },
          ...(accessFilter ? [accessFilter] : []),
        ],
        deletedAt: null,
      },
      select: { name: true, versions: { select: { filename: true }, take: 1 }, description: true },
      take: limit,
      
    });

    const terms = new Set<string>();
    suggestions.forEach((doc) => {
      if (doc.name?.trim()) terms.add(doc.name);
      if (doc.versions?.[0]?.filename) terms.add(doc.versions[0].filename);
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
    if (filters.courseIds) relevantFilters.courseIds = filters.courseIds;
    if (filters.subjectIds) relevantFilters.subjectIds = filters.subjectIds;
    if (filters.dateFrom) relevantFilters.dateFrom = filters.dateFrom;
    if (filters.dateTo) relevantFilters.dateTo = filters.dateTo;
    if (filters.minSize) relevantFilters.minSize = filters.minSize;
    if (filters.maxSize) relevantFilters.maxSize = filters.maxSize;
    if (filters.mimetypes) relevantFilters.mimetypes = filters.mimetypes;
    if (typeof filters.includeContent === 'boolean') {
      relevantFilters.includeContent = filters.includeContent;
    }

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

    // El historial no tiene relaciones a documentos para filtrar recepciones.
    // Ningún rol puede descubrir consultas de otros usuarios por esta vía.
    const whereClause = {
      createdAt: { gte: thirtyDaysAgo },
      query: { not: '' },
      userId,
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
