import { AcademicYearService } from './academic-year.service';

describe('academic interval integrity', () => {
  const year = {
    id: 1,
    name: '2026-2027',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    isActive: false,
    _count: { documentAcademics: 0 },
  };
  let prisma: any;
  let service: AcademicYearService;
  beforeEach(() => {
    prisma = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue(year),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => data),
        update: jest.fn().mockImplementation(({ data }) => data),
        updateMany: jest.fn(),
      },
      course: { count: jest.fn() },
      $queryRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    service = new AcademicYearService(prisma);
  });
  it('rejects inclusive overlap even with inactive intervals before writing', async () => {
    prisma.academicYear.findMany.mockResolvedValue([year]);
    await expect(
      service.create({
        name: '2026-2027',
        startDate: '2026-12-31',
        endDate: '2027-12-31',
      }),
    ).rejects.toThrow();
    expect(prisma.academicYear.create).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
  it('validates merged partial dates', async () => {
    await expect(
      service.update(1, { startDate: '2027-01-01' }),
    ).rejects.toThrow();
    expect(prisma.academicYear.update).not.toHaveBeenCalled();
  });
  it('grandfathers unchanged dates on metadata updates', async () => {
    prisma.academicYear.findMany.mockResolvedValue([year, { ...year, id: 2 }]);
    await expect(
      service.update(1, { name: '2027-2028' }),
    ).resolves.toMatchObject({ name: '2027-2028' });
    expect(prisma.academicYear.findMany).not.toHaveBeenCalled();
  });
  it('normalizes dates and excludes its own id', async () => {
    prisma.academicYear.findMany.mockResolvedValue([year]);
    await expect(
      service.update(1, { endDate: '2027-01-01' }),
    ).resolves.toMatchObject({ endDate: new Date('2027-01-01') });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
  it('acquires the same transaction lock before reading intervals and writing', async () => {
    await service.create({
      name: '2027-2028',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    });
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.academicYear.findMany.mock.invocationCallOrder[0],
    );
    expect(
      prisma.academicYear.findMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.academicYear.create.mock.invocationCallOrder[0]);
  });
  it('serializes competing interval creations so only one can succeed', async () => {
    const rows: any[] = [];
    let tail = Promise.resolve();
    prisma.$transaction.mockImplementation(async (callback) => {
      const previous = tail;
      let release: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      const tx = {
        $queryRaw: jest.fn(async () => {
          await previous;
          return [];
        }),
        academicYear: {
          findMany: jest.fn(async () => [...rows]),
          create: jest.fn(async ({ data }) => {
            const row = { ...data, id: rows.length + 1 };
            rows.push(row);
            return row;
          }),
        },
      };
      try {
        return await callback(tx);
      } finally {
        release!();
      }
    });
    const dto = {
      name: '2027-2028',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    };
    const results = await Promise.allSettled([
      service.create(dto),
      service.create(dto),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(rows).toHaveLength(1);
  });
});
