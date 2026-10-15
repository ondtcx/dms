import { validate } from 'class-validator';
import { UpdateDocumentsDto } from './update-documents.dto';

describe('version retention settings DTO', () => {
  it.each([1, 30, 3650])('accepts %s days', async (versionRetentionDays) => {
    expect(await validate(Object.assign(new UpdateDocumentsDto(), { versionRetentionDays }), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
  it.each([0, 3651, 1.5, '30', null])('rejects %j days', async (versionRetentionDays) => {
    expect((await validate(Object.assign(new UpdateDocumentsDto(), { versionRetentionDays }), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
});
