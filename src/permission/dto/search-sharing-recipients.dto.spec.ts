import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SearchSharingRecipientsDto } from './search-sharing-recipients.dto';
describe('recipient search DTO', () => {
  it.each(['', ' ', ' a ', 2, null, 'x'.repeat(101)])('rejects query %j', (query) => {
    expect(validateSync(plainToInstance(SearchSharingRecipientsDto, { query })).length).toBeGreaterThan(0);
  });
  it('trims before validating', () => {
    const dto = plainToInstance(SearchSharingRecipientsDto, { query: ' ab ' });
    expect(dto.query).toBe('ab');
    expect(validateSync(dto)).toEqual([]);
  });
});
