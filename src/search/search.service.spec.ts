import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SearchService } from './search.service';
import { UserRole } from '../auth/role.enum';
import { buildDocumentAccessFilter } from '../auth/utils/document-access.filter';

describe('SearchService contract recovery', () => {
  let service: SearchService;
  let prisma: any;
  const user = { id: 'secretary', role: UserRole.SECRETARIO, roleAssignments: [] };

  afterEach(() => jest.useRealTimers());

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-06-10T12:00:00Z') });
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      searchHistory: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn(),
    };
    service = new SearchService(prisma);
  });

  function page(ids = [4, 3], total = 3) {
    prisma.document.findMany
      .mockResolvedValueOnce([{ id: 3 }, { id: 4 }, { id: 5 }])
      .mockResolvedValueOnce([{ id: 3, versions: [{ filename: 'three.pdf' }] },
        { id: 4, versions: [{ filename: 'four.pdf' }] }]);
    prisma.$queryRaw.mockImplementation((sql: Prisma.Sql) =>
      Promise.resolve(sql.text.includes('COUNT(*)') ? [{ total: BigInt(total) }]
        : ids.map((id) => ({ id }))),
    );
  }

  function selection(): Prisma.Sql {
    return prisma.$queryRaw.mock.calls[0][0];
  }

  it('fails closed before document queries for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.search('missing', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.RECTOR, UserRole.USER])('keeps popular search metadata personal for %s', async (role) => {
    prisma.user.findUnique.mockResolvedValue({ ...user, role });
    prisma.searchHistory.groupBy = jest.fn().mockResolvedValue([]);
    await service.getPopularSearches(user.id);
    expect(prisma.searchHistory.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: user.id }),
    }));
  });

  it('fails closed for missing suggestion users before fetching names', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getSuggestions('missing', 'submission')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('restricts SQL rows and totals to policy-selected IDs and reapplies the filter to returned documents', async () => {
    page([4], 1);
    await service.search(user.id, { query: 'submission' });
    const initial = prisma.document.findMany.mock.calls[0][0].where;
    expect(initial.AND[1]).toEqual(buildDocumentAccessFilter(user));
    const sql = selection();
    expect(sql.text).toContain('WHERE d.id IN (');
    expect(sql.values.slice(0, 3)).toEqual([3, 4, 5]);
    expect(sql.text).toContain('FROM "Directory" folder');
    for (const [statement] of prisma.$queryRaw.mock.calls) {
      expect(statement.text).toContain('COALESCE(d."receptionOriginDirectoryId", d."directoryId")');
      expect(statement.text).toContain('(d."receptionOriginDirectoryId" IS NULL AND folder."receptionEnabled" = FALSE)');
    }
    expect(initial.AND[1].OR[0].AND[0]).toEqual({ receptionOriginDirectory: null, OR: [{ directory: null }, { directory: { receptionEnabled: false } }] });
    expect(sql.text).toContain('"UserRoleAssignment"');
    expect(sql.text).toContain('r."isActive" = TRUE');
    expect(sql.text).toContain('AND NOT EXISTS');
    expect(sql.text).toContain('manager."readAll" = TRUE');
    expect(sql.values).toContain(user.id);
    expect(sql.values).toContain(false);
    expect(sql.values).toContain(true);
    expect(prisma.document.findMany.mock.calls[1][0].where).toEqual({ AND: [initial, { id: { in: [4] } }] });
  });

  it('does not issue SQL or fetch contents when access selects no IDs', async () => {
    const result = await service.search(user.id, { query: 'marker' });
    expect(result.data).toEqual([]);
    expect(result.meta).toMatchObject({ total: 0, hasNextPage: false });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps metadata alternatives independent of an optional search row', async () => {
    page();
    const result = await service.search(user.id, { query: 'DEMO_AUDIT_20260929_8B4D', includeContent: true, limit: 2 });
    const sql = selection();
    expect(sql.text).toContain('LEFT JOIN "DocumentSearch"');
    expect(sql.text).toContain('d.description ILIKE');
    expect(sql.text).toContain('OR d.name ILIKE');
    expect(sql.text).toContain('OR v.filename ILIKE');
    expect(sql.text).toContain('OR d."documentNumber" ILIKE');
    expect(sql.text).toContain('OR s."extractedText" ILIKE');
    expect(sql.text).toContain('OR s."searchVector" @@ plainto_tsquery');
    expect(sql.text).not.toContain('d."searchVector"');
    expect(result.data.map((doc) => doc.id)).toEqual([4, 3]);
    expect(result.meta).toMatchObject({ total: 3, totalPages: 2, hasNextPage: true });
    expect(prisma.document.findMany.mock.calls[0][0].select).toEqual({ id: true });
    expect(prisma.searchHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultCount: 3, query: 'DEMO_AUDIT_20260929_8B4D' }),
    }));
  });

  it('matches metadata and the institutional number without touching content by default', async () => {
    page();
    await service.search(user.id, { query: 'GA-PLN-2026-0042' });
    const sql = selection();
    expect(sql.text).toContain('d.description ILIKE');
    expect(sql.text).toContain('OR d.name ILIKE');
    expect(sql.text).toContain('OR v.filename ILIKE');
    expect(sql.text).toContain('OR d."documentNumber" ILIKE');
    expect(sql.text).not.toContain('s."extractedText"');
    expect(sql.text).not.toContain('s."searchVector"');
    expect(sql.text).not.toContain('@@ plainto_tsquery');
    expect(sql.text).toContain("to_tsvector('spanish'");
    expect(sql.text).toContain('setweight(');
  });

  it('adds extracted content and the stored vector only when content search is opted in', async () => {
    page();
    await service.search(user.id, { query: 'reuniones', includeContent: true });
    const sql = selection();
    expect(sql.text).toContain('s."extractedText" ILIKE');
    expect(sql.text).toContain('s."searchVector" @@ plainto_tsquery');
    expect(sql.text).toContain('ts_rank(s."searchVector"');
    expect(sql.text).toContain('d."documentNumber" ILIKE');
  });

  it.each([false, true])('matches the institutional number regardless of includeContent=%s', async (includeContent) => {
    page();
    await service.search(user.id, { query: 'GA-2026-0042', includeContent });
    expect(selection().text).toContain('d."documentNumber" ILIKE');
  });

  it('prioritizes an exact case-insensitive number for relevance ordering only', async () => {
    page();
    await service.search(user.id, { query: 'GA-PLN-2026-0042', sortBy: 'relevance' });
    expect(selection().text).toContain('ORDER BY (LOWER(d."documentNumber") = LOWER(');
  });

  it('leaves explicit sort orders unaffected by exact-number priority', async () => {
    page();
    await service.search(user.id, { query: 'GA-PLN-2026-0042', sortBy: 'size' });
    expect(selection().text).not.toContain('LOWER(d."documentNumber") = LOWER(');
  });

  it('persists the content-search option in the saved filters', async () => {
    page();
    await service.search(user.id, { query: 'acta', includeContent: true });
    expect(prisma.searchHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ filters: expect.objectContaining({ includeContent: true }) }),
    }));
  });

  it('binds hostile text and escapes wildcard characters rather than interpolating SQL', async () => {
    page();
    const query = "%' OR TRUE; --_\\";
    await service.search(user.id, { query });
    expect(selection().text).not.toContain(query);
    expect(selection().values).toContain(query);
    expect(selection().values).toContain("%\\%' OR TRUE; --\\_\\\\%");
  });

  it.each([UserRole.SECRETARIO, UserRole.PROFESOR, UserRole.ADMIN, UserRole.RECTOR])(
    'preserves the existing access resolver for %s in candidate and returned queries', async (role) => {
      page();
      prisma.user.findUnique.mockResolvedValue({ ...user, role });
      await service.search(user.id, { categoryIds: [2], includeDeleted: true });
      const initial = prisma.document.findMany.mock.calls[0][0].where;
      const access = buildDocumentAccessFilter({ id: user.id, role, assignments: [] });
      if (access) {
        expect(initial.AND[1]).toMatchObject({ OR: expect.any(Array) });
        expect(initial.AND[1]).toEqual(access);
      } else {
        expect(initial).toEqual({ categoryId: { in: [2] } });
      }
      expect(prisma.document.findMany.mock.calls[1][0].where).toEqual({
        AND: [initial, { id: { in: [4, 3] } }],
      });
    },
  );

  it('loads active catalog roles and passes them to compatibility grants', async () => {
    page();
    prisma.user.findUnique.mockResolvedValue({
      ...user, roleAssignments: [{ role: { id: 27, key: 'custom-secretary', isActive: true } }],
    });
    await service.search(user.id, {});
    expect(prisma.user.findUnique.mock.calls[0][0].select.roleAssignments.where)
      .toEqual({ role: { isActive: true } });
    const access = JSON.stringify(prisma.document.findMany.mock.calls[0][0].where);
    expect(access).toContain('27');
    expect(access).toContain('roleId');
  });

  it('AND-combines academic, date, owner, category, visibility and deletion filters', async () => {
    page();
    await service.search(user.id, {
      courseIds: [1], subjectIds: [2], categoryIds: [3], uploadedById: 'owner',
      dateFrom: '2026-01-01', dateTo: '2026-12-31', isPublic: false,
    });
    expect(prisma.document.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      academic: { courseId: { in: [1] }, subjectId: { in: [2] } },
      categoryId: { in: [3] }, uploadedById: 'owner', isPublic: false, deletedAt: null,
      createdAt: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
    });
  });

  it('intersects institutional types and compatible categories with access on both reads', async () => {
    jest.useFakeTimers({ now: new Date('2026-06-10T12:00:00Z') });
    try {
      page();
      const filters = { documentTypeIds: [7, 8], categoryIds: [2] };
      await service.search(user.id, filters);
      const initial = prisma.document.findMany.mock.calls[0][0].where;
      expect(initial.AND[0]).toEqual({
        documentTypeId: { in: [7, 8] }, categoryId: { in: [2] }, deletedAt: null,
      });
      expect(initial.AND[1]).toEqual(buildDocumentAccessFilter({
        id: user.id, role: user.role, assignments: [],
      }));
      expect(prisma.document.findMany.mock.calls[1][0].where).toEqual({
        AND: [initial, { id: { in: [4, 3] } }],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['2026-06-10', '2026-06-10T23:59:59.999Z'])(
    'includes the whole final UTC day with lower bound %s', async (dateFrom) => {
      await service.search(user.id, { dateFrom, dateTo: '2026-06-10' });
      expect(prisma.document.findMany.mock.calls[0][0].where.AND[0].createdAt).toEqual({
        gte: new Date(dateFrom), lt: new Date('2026-06-11T00:00:00.000Z'),
      });
    },
  );

  it('retains exact inclusive timestamp bounds with UTC offsets', async () => {
    await service.search(user.id, {
      dateFrom: '2026-06-10T10:00:00+02:00', dateTo: '2026-06-10T10:00:00+02:00',
    });
    expect(prisma.document.findMany.mock.calls[0][0].where.AND[0].createdAt).toEqual({
      gte: new Date('2026-06-10T08:00:00Z'), lte: new Date('2026-06-10T08:00:00Z'),
    });
  });

  it.each([
    ['2026-06-11', '2026-06-10'],
    ['2026-06-11T00:00:00Z', '2026-06-10'],
    ['2026-06-10T10:00:01Z', '2026-06-10T10:00:00Z'],
  ])('rejects inverted dates %s / %s before document reads', async (dateFrom, dateTo) => {
    await expect(service.search(user.id, { dateFrom, dateTo }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.search(user.id, { dateFrom, dateTo }))
      .rejects.toThrow('La fecha desde no puede ser posterior a la fecha hasta');
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses the same newest-version rule for display, MIME, size and sorting', async () => {
    page();
    await service.search(user.id, {
      minSize: 0, maxSize: 100, mimetypes: ['image/', 'application/pdf'], sortBy: 'size',
    });
    const sql = selection();
    expect(sql.text).toContain('ORDER BY "createdAt" DESC, id DESC LIMIT 1');
    expect(sql.text).toContain('v.size >=');
    expect(sql.text).toContain('v.size <=');
    expect(sql.text).toContain('starts_with(v.mimetype,');
    expect(sql.text).toContain('v.mimetype =');
    expect(sql.values).toEqual(expect.arrayContaining([0, 100, 'image/', 'application/pdf']));
    expect(prisma.document.findMany.mock.calls[1][0].include.versions).toEqual({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
    });
    const count: Prisma.Sql = prisma.$queryRaw.mock.calls[1][0];
    expect(count.text.split('FROM "Document"')[1].trim())
      .toEqual(sql.text.split('FROM "Document"')[1].split('ORDER BY v.size')[0].trim());
  });

  it.each([
    ['relevance', 'd."createdAt"'], ['createdAt', 'd."createdAt"'],
    ['updatedAt', 'd."updatedAt"'], ['filename', 'v.filename'], ['size', 'v.size'],
  ])('sorts %s globally with a stable tie before offset/limit', async (sortBy, column) => {
    page();
    await service.search(user.id, { sortBy, sortOrder: 'asc', page: 3, limit: 2 });
    expect(selection().text).toContain(`ORDER BY ${column} ASC NULLS LAST, d.id ASC`);
    expect(selection().text).toMatch(/ORDER BY[\s\S]*LIMIT \$\d+ OFFSET \$\d+/);
    expect(selection().values.slice(-2)).toEqual([2, 4]);
  });

  it('ranks in SQL before paging, rather than reordering an already paged collection', async () => {
    page();
    await service.search(user.id, { query: 'meeting', sortBy: 'relevance' });
    expect(selection().text).toMatch(/ORDER BY[\s\S]*COALESCE\(ts_rank[\s\S]*DESC NULLS LAST, d.id ASC/);
  });

  it('uses Spanish for both bound ranking and matching, including count', async () => {
    page();
    await service.search(user.id, { query: 'reuniones', includeContent: true });
    const [rows, count] = prisma.$queryRaw.mock.calls.map(([sql]) => sql as Prisma.Sql);
    expect(rows.text).toContain("ts_rank(s.\"searchVector\", plainto_tsquery('spanish',");
    for (const sql of [rows, count]) {
      expect(sql.text).toContain("@@ plainto_tsquery('spanish',");
      expect(sql.text).not.toContain("'simple'");
      expect(sql.values).toContain('reuniones');
    }
  });

  it('does not retry an SQL failure without filters', async () => {
    prisma.document.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.$queryRaw.mockRejectedValue(new Error('database failed'));
    await expect(service.search(user.id, { categoryIds: [2] })).rejects.toThrow('database failed');
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.searchHistory.create).not.toHaveBeenCalled();
  });

  it('suggests logical names and original filenames using the existing access filter', async () => {
    prisma.document.findMany.mockResolvedValue([{ name: 'Consejo', versions: [{ filename: 'original.pdf' }], description: null }]);
    await expect(service.getSuggestions(user.id, 'Consejo')).resolves.toEqual(['Consejo', 'original.pdf']);
    const args = prisma.document.findMany.mock.calls[0][0];
    expect(args.where.AND[0].OR).toContainEqual({ name: { contains: 'Consejo', mode: 'insensitive' } });
    expect(args.where.AND[1]).toEqual(buildDocumentAccessFilter(user));
    expect(args.select.name).toBe(true);
    expect(args.where.deletedAt).toBeNull();
  });
});
