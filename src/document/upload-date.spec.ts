import { calendarDate, uploadDay, inferAcademicYear } from './upload-date';

describe('upload calendar dates', () => {
  it.each(['2026-02-29', '2026-13-01', '2026-1-01', '2026-01-01T00:00:00Z'])(
    'rejects %s',
    (value) => {
      expect(() => calendarDate(value)).toThrow();
    },
  );
  it('accepts leap days without timezone conversion', () => {
    expect(calendarDate('2024-02-29').toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });
  it('projects upload instants into Guayaquil', () => {
    expect(uploadDay(new Date('2026-01-01T04:59:59Z'))).toBe('2025-12-31');
    expect(uploadDay(new Date('2026-01-01T05:00:00Z'))).toBe('2026-01-01');
  });
  it('includes endpoints and inactive intervals without current fallback', () => {
    const years = [
      {
        id: 2,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        isActive: false,
      },
    ];
    expect(inferAcademicYear('2026-01-01', years).academicYearId).toBe(2);
    expect(inferAcademicYear('2026-12-31', years).academicYearId).toBe(2);
    expect(inferAcademicYear('2025-12-31', years)).toMatchObject({
      academicYearId: null,
      warning: expect.any(String),
    });
    expect(
      inferAcademicYear('2026-01-01', [...years, { ...years[0], id: 3 }]),
    ).toMatchObject({ academicYearId: null, warning: expect.any(String) });
  });
});
