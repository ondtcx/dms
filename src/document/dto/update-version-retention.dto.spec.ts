import { validate } from 'class-validator';
import { UpdateVersionRetentionDto } from './update-version-retention.dto';

describe('UpdateVersionRetentionDto', () => {
  it.each([{ mode: 'normal' }, { mode: 'permanent' }, { mode: 'until', preserveUntil: '2099-01-01T00:00:00Z' }])('accepts %j', async (body) => {
    expect(await validate(Object.assign(new UpdateVersionRetentionDto(), body))).toEqual([]);
  });
  it.each([{ mode: 'until' }, { mode: 'unknown' }, { mode: 'until', preserveUntil: '2020-01-01T00:00:00Z' }, { mode: 'until', preserveUntil: '2099-02-30T00:00:00Z' }, { mode: 'normal', preserveUntil: null }, { mode: 'permanent', preserveUntil: '2099-01-01T00:00:00Z' }])('rejects %j', async (body) => {
    expect((await validate(Object.assign(new UpdateVersionRetentionDto(), body))).length).toBeGreaterThan(0);
  });
});
