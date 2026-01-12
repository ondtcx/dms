import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { Prisma } from '@prisma/client';

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

    // Construir condiciones WHERE
    const where: any = {};

    // Full-text search con PostgreSQL tsvector
    if (query && query.trim()) {
      // Convertir query a tsquery format
      const tsquery = query
        .trim()
        .split(/\s+/)
        .map((term) => `${term}:*`)
        .join(' & ');

      where.searchVector = {
        search: tsquery,
      };
    }

    // Filtros de categoría
    if (categoryIds && categoryIds.length > 0) {
      where.categoryId = { in: categoryIds };
    }

    // Filtros de sección
    if (sectionIds && sectionIds.length > 0) {
      where.sectionId = { in: sectionIds };
    }

    // Filtros organizacionales
    if (departmentIds && departmentIds.length > 0) {
      where.OR = [
        { course: { departmentId: { in: departmentIds } } },
        { uploadedBy: { departmentId: { in: departmentIds } } },
      ];
    }

    if (courseIds && courseIds.length > 0) {
      where.courseId = { in: courseIds };
    }

    if (subjectIds && subjectIds.length > 0) {
      where.subjectId = { in: subjectIds };
    }

    // Filtro de usuario que subió
    if (uploadedById) {
      where.uploadedById = uploadedById;
    }

    // Filtros de fecha
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    // Filtros de tamaño
    if (minSize || maxSize) {
      where.size = {};
      if (minSize) {
        where.size.gte = minSize;
      }
      if (maxSize) {
        where.size.lte = maxSize;
      }
    }

    // Filtro de tipo MIME
    if (mimetypes && mimetypes.length > 0) {
      where.mimetype = { in: mimetypes };
    }

    // Filtro de visibilidad
    if (isPublic !== undefined) {
      where.isPublic = isPublic;
    }

    // Filtro de eliminados
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    // Construir ordenamiento
    let orderBy: any = {};
    if (sortBy === 'relevance' && query && query.trim()) {
      // Ordenar por relevancia usando ts_rank
      orderBy = [{ _relevance: { fields: ['searchVector'], search: query, sort: sortOrder } }];
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Paginación
    const skip = (page - 1) * limit;
    const take = limit;

    // Ejecutar búsqueda
    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          category: {
            select: { id: true, name: true, color: true, icon: true },
          },
          section: {
            select: { id: true, name: true, color: true, icon: true },
          },
          uploadedBy: {
            select: { id: true, name: true, email: true },
          },
          course: {
            select: { id: true, name: true, code: true },
          },
          subject: {
            select: { id: true, name: true, code: true },
          },
          template: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

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

  async getSuggestions(query: string, limit: number = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    // Buscar sugerencias basadas en nombres de archivo y descripciones
    const suggestions = await this.prisma.document.findMany({
      where: {
        OR: [
          { filename: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
        deletedAt: null,
      },
      select: {
        filename: true,
        description: true,
      },
      take: limit,
      distinct: ['filename'],
    });

    // Extraer términos únicos
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
    if (filters.departmentIds) relevantFilters.departmentIds = filters.departmentIds;
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
    return this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
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

  async getPopularSearches(limit: number = 10) {
    // Obtener las búsquedas más frecuentes de los últimos 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const popularSearches = await this.prisma.searchHistory.groupBy({
      by: ['query'],
      where: {
        createdAt: { gte: thirtyDaysAgo },
        query: { not: '' },
      },
      _count: {
        query: true,
      },
      orderBy: {
        _count: {
          query: 'desc',
        },
      },
      take: limit,
    });

    return popularSearches.map((item) => ({
      query: item.query,
      count: item._count.query,
    }));
  }
}
