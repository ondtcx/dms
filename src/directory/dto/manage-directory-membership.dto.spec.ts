import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DirectoryParticipantDto, DirectoryDelegateDto } from './manage-directory-membership.dto';

describe('directory membership DTOs', () => {
  it('accepts a direct participant and a role participant', async () => {
    for (const body of [{ userId: 'user', peerRead: false }, { roleId: 2, peerRead: true }]) {
      expect(await validate(plainToInstance(DirectoryParticipantDto, body))).toHaveLength(0);
    }
  });
  it.each([{ peerRead: true }, { userId: 'u', roleId: 2, peerRead: true }, { roleId: 0, peerRead: true }, { userId: 'u', peerRead: 'false' }])('rejects malformed participant %j', async (body) => {
    expect((await validate(plainToInstance(DirectoryParticipantDto, body))).length).toBeGreaterThan(0);
  });
  it('rejects ownership transfer and identity replacement in delegate updates', async () => {
    expect((await validate(plainToInstance(DirectoryDelegateDto, { full: true, userId: 'other', createdById: 'other' }), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
  it('rejects null and string delegate flags', async () => {
    for (const body of [{ full: null }, { review: 'true' }]) {
      expect((await validate(plainToInstance(DirectoryDelegateDto, body))).length).toBeGreaterThan(0);
    }
  });
});
