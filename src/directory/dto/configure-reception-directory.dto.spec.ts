import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigureReceptionDirectoryDto } from './configure-reception-directory.dto';

describe('ConfigureReceptionDirectoryDto', () => {
  it('accepts explicit boolean settings', async () => {
    expect(await validate(plainToInstance(ConfigureReceptionDirectoryDto, { enabled: true, singleDocumentPerParticipant: false }))).toHaveLength(0);
  });
  it.each([{ enabled: 'true' }, { enabled: null }, { enabled: true, createdById: 'other' }, { enabled: true, singleDocumentPerParticipant: 'false' }])('rejects unsafe input %j', async (body) => {
    expect((await validate(plainToInstance(ConfigureReceptionDirectoryDto, body), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
});
