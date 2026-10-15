import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UploadMultipleDocumentsDto } from './upload-multiple-documents.dto';

describe('positional upload metadata', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const boundary = {
    type: 'body' as const,
    metatype: UploadMultipleDocumentsDto,
  };
  it('parses ordered per-file JSON with independent fields', async () => {
    const metadata = [
      { description: ' First ', documentTypeId: 12, originDate: '2024-02-29' },
      { description: 'Second', documentTypeId: 13 },
    ];
    const result = await pipe.transform(
      { directoryId: '7', metadata: JSON.stringify(metadata) },
      boundary,
    );
    expect(result.directoryId).toBe(7);
    expect(result.metadata.map((item) => item.description)).toEqual([
      'First',
      'Second',
    ]);
  });
  it.each([
    '{',
    '{}',
    'null',
    '[]',
    '[{"description":"A","documentTypeId":12,"originDate":"2026-02-29"}]',
  ])('rejects invalid metadata %s', async (metadata) => {
    await expect(pipe.transform({ metadata }, boundary)).rejects.toThrow();
  });
  it.each([undefined, '', '   '])(
    'accepts optional batch description %j',
    async (description) => {
      const result = await pipe.transform(
        { metadata: JSON.stringify([{ description, documentTypeId: 12 }]) },
        boundary,
      );
      expect(result.metadata[0].description).toBeUndefined();
    },
  );
  it.each(['object', 'multipart'])('rejects nested caller search in %s batches', async (shape) => {
    const metadata = [{ description: 'A', documentTypeId: 12, search: { extractedText: 'forged' } }];
    await expect(pipe.transform({ metadata: shape === 'object' ? metadata : JSON.stringify(metadata) }, boundary)).rejects.toThrow();
  });
  it('rejects a per-file destination rather than allowing mixed destinations', async () => {
    await expect(
      pipe.transform(
        {
          metadata: JSON.stringify([
            { description: 'A', documentTypeId: 12, directoryId: 9 },
          ]),
        },
        boundary,
      ),
    ).rejects.toThrow();
  });
});

describe('multi-upload concrete identifier parsing', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const boundary = {
    type: 'body' as const,
    metatype: UploadMultipleDocumentsDto,
  };

  function parse(item: Record<string, unknown>) {
    return pipe.transform({ metadata: JSON.stringify([item]) }, boundary);
  }

  it('accepts omitted and explicit null document types as generic', async () => {
    const omitted = await parse({ description: 'A' });
    expect(omitted.metadata[0].documentTypeId ?? null).toBeNull();

    const explicit = await parse({ description: 'A', documentTypeId: null });
    expect(explicit.metadata[0].documentTypeId ?? null).toBeNull();
  });

  it.each([0, '0', '12x', 1.5, 'abc', true])(
    'rejects zero/malformed document type %j instead of coercing to generic',
    async (documentTypeId) => {
      await expect(
        parse({ description: 'A', documentTypeId }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each([0, '0', '12x', 1.5, 'abc', true])(
    'rejects zero/malformed category %j',
    async (categoryId) => {
      await expect(
        parse({ description: 'A', documentTypeId: 12, categoryId }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('accepts numeric strings for concrete identifiers', async () => {
    const result = await parse({
      description: 'A',
      documentTypeId: '12',
      categoryId: '9',
    });
    expect(result.metadata[0]).toMatchObject({
      documentTypeId: 12,
      categoryId: 9,
    });
  });
});
