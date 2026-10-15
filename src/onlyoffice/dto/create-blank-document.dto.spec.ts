import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateBlankDocumentDto } from './create-blank-document.dto';

describe('CreateBlankDocumentDto concrete identifier parsing', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const boundary = { type: 'body' as const, metatype: CreateBlankDocumentDto };

  const base = { title: 'Notas', fileType: 'txt' as const };

  it('accepts an omitted document type as generic', async () => {
    const result = await pipe.transform(base, boundary);
    expect(result.documentTypeId).toBeUndefined();
  });

  it('accepts an explicit null document type as generic', async () => {
    const result = await pipe.transform(
      { ...base, documentTypeId: null },
      boundary,
    );
    expect(result.documentTypeId).toBeNull();
  });

  it.each([0, '0', '12x', 1.5, 'abc', true])(
    'rejects zero/malformed document type %j instead of coercing to generic',
    async (documentTypeId) => {
      await expect(
        pipe.transform({ ...base, documentTypeId }, boundary),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each(['categoryId', 'courseId'] as const)(
    'rejects zero/malformed %s',
    async (key) => {
      for (const value of [0, '0', '12x', 1.5, 'abc', true]) {
        await expect(
          pipe.transform({ ...base, [key]: value }, boundary),
        ).rejects.toThrow(BadRequestException);
      }
    },
  );

  it('accepts numeric strings for concrete identifiers', async () => {
    const result = await pipe.transform(
      { ...base, documentTypeId: '7', categoryId: '3', courseId: '2' },
      boundary,
    );
    expect(result).toMatchObject({
      documentTypeId: 7,
      categoryId: 3,
      courseId: 2,
    });
  });
});
