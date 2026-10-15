import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAcademicYearDto } from './create-academic-year.dto';

describe('academic date inputs', () => {
  it.each(['2026-02-29', '2026-01-01T00:00:00Z'])(
    'rejects non-calendar input %s',
    async (startDate) => {
      expect(
        await validate(
          plainToInstance(CreateAcademicYearDto, {
            name: '2026-2027',
            startDate,
            endDate: '2027-01-01',
          }),
        ),
      ).not.toHaveLength(0);
    },
  );
  it('accepts a one-day inclusive interval', async () => {
    expect(
      await validate(
        plainToInstance(CreateAcademicYearDto, {
          name: '2026-2027',
          startDate: '2026-01-01',
          endDate: '2026-01-01',
        }),
      ),
    ).toHaveLength(0);
  });
});
