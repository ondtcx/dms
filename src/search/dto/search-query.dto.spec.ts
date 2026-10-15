import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchQueryDto } from './search-query.dto';

describe('SearchQueryDto', () => {
  async function errors(input: Record<string, unknown>) {
    return validate(plainToInstance(SearchQueryDto, input));
  }

  it('keeps valid defaults', async () => {
    const dto = plainToInstance(SearchQueryDto, {});
    expect(dto).toMatchObject({ page: 1, limit: 20, sortBy: 'relevance', sortOrder: 'desc', includeContent: false });
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['isPublic', 'includeDeleted', 'includeContent'])('converts explicit true/false for %s', async (field) => {
    for (const [input, output] of [['false', false], ['true', true], [false, false], [true, true]]) {
      const dto = plainToInstance(SearchQueryDto, { [field]: input });
      expect(dto[field]).toBe(output);
      expect(await validate(dto)).toEqual([]);
    }
    expect((await errors({ [field]: 'anything' })).map(({ property }) => property)).toContain(field);
  });

  it.each(['categoryIds', 'documentTypeIds', 'courseIds', 'subjectIds'])('validates numeric array elements for %s', async (field) => {
    const dto = plainToInstance(SearchQueryDto, { [field]: ['1', '2'] });
    expect(dto[field]).toEqual([1, 2]);
    expect(await validate(dto)).toEqual([]);
    for (const invalid of [['bad'], ['1.5'], ['0'], ['-1'], '1']) {
      expect((await errors({ [field]: invalid })).map(({ property }) => property)).toContain(field);
    }
  });

  it('rejects non-string MIME elements', async () => {
    expect(await errors({ mimetypes: ['image/', 'application/pdf'] })).toEqual([]);
    expect((await errors({ mimetypes: [27] })).map(({ property }) => property)).toContain('mimetypes');
  });

  it.each(['relevance', 'createdAt', 'updatedAt', 'filename', 'size'])('accepts supported sort %s', async (sortBy) => {
    expect(await errors({ sortBy, sortOrder: 'asc' })).toEqual([]);
  });

  it('rejects unknown sort identifiers and directions', async () => {
    const result = await errors({ sortBy: 'description; DROP TABLE', sortOrder: 'sideways' });
    expect(result.map(({ property }) => property).sort()).toEqual(['sortBy', 'sortOrder']);
  });

  it('coerces valid page/size values and retains zero bounds', async () => {
    const dto = plainToInstance(SearchQueryDto, { page: '2', limit: '5', minSize: '0', maxSize: '0' });
    expect(dto).toMatchObject({ page: 2, limit: 5, minSize: 0, maxSize: 0 });
    expect(await validate(dto)).toEqual([]);
    expect((await errors({ page: '0', limit: '1.5', minSize: '-1', maxSize: 'bad' })).length).toBe(4);
  });
});
