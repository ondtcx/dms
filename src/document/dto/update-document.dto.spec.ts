import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateDocumentDto } from './update-document.dto';

describe('update document identity boundary', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const boundary = { type: 'body' as const, metatype: UpdateDocumentDto };

  it('accepts and trims the visible name and institutional number', async () => {
    expect(await pipe.transform({ name: '  Consejo  ', documentNumber: '  Manual / 7  ' }, boundary))
      .toMatchObject({ name: 'Consejo', documentNumber: 'Manual / 7' });
  });
  it.each(['', '   ', null])('clears an explicitly blank institutional number %j', async (documentNumber) => {
    expect((await pipe.transform({ documentNumber }, boundary)).documentNumber).toBeNull();
  });
  it('leaves omitted identity fields unchanged', async () => {
    const result = await pipe.transform({ description: 'Agenda' }, boundary);
    expect(result.name).toBeUndefined();
    expect(result.documentNumber).toBeUndefined();
  });
  it.each(['', '   ', null, 7, true])('rejects invalid visible name %j', async (name) => {
    await expect(pipe.transform({ name }, boundary)).rejects.toThrow(BadRequestException);
  });
  it.each([7, true, {}])('rejects non-text institutional number %j', async (documentNumber) => {
    await expect(pipe.transform({ documentNumber }, boundary)).rejects.toThrow(BadRequestException);
  });
});

describe('update server-owned search boundary', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const boundary = { type: 'body' as const, metatype: UpdateDocumentDto };
  it.each([{ extractedText: 'forged' }, '{"extractedText":"forged"}', null])('rejects caller search (%j)', async (search) => {
    await expect(pipe.transform({ search }, boundary)).rejects.toThrow(BadRequestException);
  });
  it('preserves optional metadata and academic editing', async () => {
    expect(await pipe.transform({ description: 'Agenda', academic: { courseId: 3 } }, boundary)).toMatchObject({ description: 'Agenda', academic: { courseId: 3 } });
  });
});

describe('update document classification boundary', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const boundary = { type: 'body' as const, metatype: UpdateDocumentDto };

  it('preserves an explicit null document type to clear to generic', async () => {
    const result = await pipe.transform({ documentTypeId: null }, boundary);
    expect(result.documentTypeId).toBeNull();
  });

  it('leaves an omitted document type as no-op undefined', async () => {
    const result = await pipe.transform({ description: 'Agenda' }, boundary);
    expect(result.documentTypeId).toBeUndefined();
  });

  it.each([0, '0', '12x', 1.5, 'abc', true])(
    'rejects zero/malformed document type %j',
    async (documentTypeId) => {
      await expect(
        pipe.transform({ documentTypeId }, boundary),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each([0, '0', '12x', 1.5, 'abc', true])(
    'rejects zero/malformed category %j',
    async (categoryId) => {
      await expect(
        pipe.transform({ categoryId }, boundary),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('accepts numeric strings for concrete identifiers', async () => {
    expect(
      await pipe.transform({ documentTypeId: '12', categoryId: '9' }, boundary),
    ).toMatchObject({ documentTypeId: 12, categoryId: 9 });
  });
});
