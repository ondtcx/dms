import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  DocumentAcademicDto,
  DocumentMetadataDto,
  UploadDocumentDto,
} from './upload-document.dto';
import { UpdateDocumentDto } from './update-document.dto';

describe('legacy document metadata academic validation', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      enableDebugMessages: true,
    });
  });

  const metadata = { type: 'body' as const, metatype: DocumentMetadataDto };

  async function rejectAcademic(academic: unknown, message: string) {
    let error: unknown;
    try {
      await pipe.transform({ academic }, metadata);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    const exception = error as BadRequestException;
    expect(exception.getStatus()).toBe(400);
    const response = exception.getResponse() as {
      statusCode: number;
      message: string | string[];
    };
    expect(response.statusCode).toBe(400);
    expect(
      Array.isArray(response.message)
        ? response.message.join('; ')
        : response.message,
    ).toContain(message);
  }

  it.each([1, 2])(
    'accepts multipart academic year %i with transform disabled',
    async (academicYearId) => {
      const result = await pipe.transform(
        {
          documentTypeId: '6',
          categoryId: '2',
          academic: JSON.stringify({ academicYearId }),
        },
        metadata,
      );

      expect(result).not.toBeInstanceOf(UploadDocumentDto);
      expect(result).toEqual({
        documentTypeId: 6,
        categoryId: 2,
        academic: { academicYearId },
      });
    },
  );

  it.each(['object', 'instance'])(
    'preserves %s academic input',
    async (shape) => {
      const academic =
        shape === 'instance'
          ? Object.assign(new DocumentAcademicDto(), { academicYearId: 2 })
          : { academicYearId: 2 };
      const result = await pipe.transform({ academic }, metadata);
      expect(result.academic).toEqual({ academicYearId: 2 });
    },
  );

  it('preserves omitted academic data', async () => {
    const result = await pipe.transform(
      { description: 'Synthetic document' },
      metadata,
    );
    expect(result).toEqual({ description: 'Synthetic document' });
    expect(result).not.toHaveProperty('academic');
  });

  it.each([null, 'null'])(
    'preserves optional academic null (%s)',
    async (academic) => {
      expect(await pipe.transform({ academic }, metadata)).toEqual({
        academic: null,
      });
    },
  );

  it.each(['multipart', 'object'])(
    'validates all nested numeric strings in %s input',
    async (shape) => {
      const academic = { academicYearId: '2', courseId: '3', subjectId: '4' };
      const result = await pipe.transform(
        {
          academic: shape === 'multipart' ? JSON.stringify(academic) : academic,
        },
        metadata,
      );
      expect(result.academic).toEqual({
        academicYearId: 2,
        courseId: 3,
        subjectId: 4,
      });
    },
  );

  it.each(['academicYearId', 'courseId', 'subjectId'])(
    'rejects nonnumeric %s in multipart and object inputs',
    async (key) => {
      const academic = { academicYearId: 2, [key]: 'not-a-number' };
      await rejectAcademic(
        JSON.stringify(academic),
        `academic.${key} must be an integer number`,
      );
      await rejectAcademic(
        academic,
        `academic.${key} must be an integer number`,
      );
    },
  );

  it.each(['academicYearId', 'courseId', 'subjectId'])(
    'rejects noninteger boolean %s without weakening nested validation',
    async (key) => {
      await rejectAcademic(
        JSON.stringify({ [key]: true }),
        `academic.${key} must be an integer number`,
      );
    },
  );

  it.each(['multipart', 'object', 'instance'])(
    'rejects rather than silently strips unknown academic fields in %s input',
    async (shape) => {
      const fields = { academicYearId: 2, unauthorized: true };
      const academic =
        shape === 'multipart'
          ? JSON.stringify(fields)
          : shape === 'instance'
            ? Object.assign(new DocumentAcademicDto(), fields)
            : fields;
      await rejectAcademic(
        academic,
        'academic.property unauthorized should not exist',
      );
    },
  );

  it.each(['{', '', '{"academicYearId":2,}'])(
    'rejects malformed JSON (%s) with 400 rather than SyntaxError',
    async (academic) => {
      await rejectAcademic(
        academic,
        'Los datos académicos deben ser un objeto JSON válido',
      );
    },
  );

  it.each([
    [],
    [{ academicYearId: 2 }],
    '[]',
    '[{"academicYearId":2}]',
    2,
    true,
    '2',
    'true',
    '"text"',
  ])('rejects arrays and non-null primitives (%j)', async (academic) => {
    await rejectAcademic(
      academic,
      'Los datos académicos deben ser un objeto JSON válido',
    );
  });

  it.each(['upload', 'uploadMultiple'])(
    'accepts academic data through the shared body DTO boundary for %s',
    async () => {
      const result = await pipe.transform(
        { academic: '{"academicYearId":2}' },
        metadata,
      );
      expect(result.academic.academicYearId).toBe(2);
    },
  );

  it('retains top-level whitelist rejection', async () => {
    await expect(
      pipe.transform(
        { academic: '{"academicYearId":2}', unauthorized: true },
        metadata,
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: ['property unauthorized should not exist'],
      },
    });
  });
});

describe('upload required metadata and update compatibility', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const boundary = { type: 'body' as const, metatype: UploadDocumentDto };
  it('accepts and trims independent upload-only name and number without format restrictions', async () => {
    expect(await pipe.transform({ description: 'Agenda', documentTypeId: 12,
      name: '  Consejo / sesión  ', documentNumber: '  manual / 7  ' }, boundary))
      .toMatchObject({ name: 'Consejo / sesión', documentNumber: 'manual / 7' });
  });
  it.each(['name', 'documentNumber'])('omits blank %s but rejects non-string input and editing', async (key) => {
    const result = await pipe.transform({ description: 'Agenda', documentTypeId: 12, [key]: '  ' }, boundary);
    expect(result[key]).toBeUndefined();
    for (const value of [null, 3, true, [], {}]) {
      await expect(pipe.transform({ description: 'Agenda', documentTypeId: 12, [key]: value }, boundary)).rejects.toThrow();
    }
    await expect(pipe.transform({ [key]: 'value' }, { type: 'body', metatype: UpdateDocumentDto })).rejects.toThrow();
  });
  it.each([{ extractedText: 'forged' }, '{"extractedText":"forged"}', null])('rejects caller search on upload (%j)', async (search) => {
    await expect(pipe.transform({ description: 'Agenda', documentTypeId: 12, search }, boundary)).rejects.toThrow(BadRequestException);
  });
  it('ignores legacy academic upload metadata without validating or inferring from it', async () => {
    const result = await pipe.transform(
      {
        description: 'Agenda',
        documentTypeId: 12,
        academic: '{not academic JSON',
      },
      boundary,
    );
    expect(result.academic).toBeUndefined();
  });
  it.each([undefined, '', ' \n '])(
    'accepts omitted or blank description %j as empty metadata',
    async (description) => {
      const result = await pipe.transform({ description, documentTypeId: 12 }, boundary);
      expect(result.description).toBeUndefined();
    },
  );
  it.each([undefined, null])(
    'accepts generic document type %j',
    async (documentTypeId) => {
      const result = await pipe.transform(
        { description: 'Agenda', documentTypeId },
        boundary,
      );
      expect(result.documentTypeId ?? null).toBeNull();
    },
  );
  it.each(['12x', 0])(
    'rejects invalid concrete document type %j',
    async (documentTypeId) => {
      await expect(
        pipe.transform({ description: 'Agenda', documentTypeId }, boundary),
      ).rejects.toThrow();
    },
  );
  it.each(['2026-02-29', null, '', '2026-01-01T00:00:00Z'])(
    'rejects invalid origin date %j',
    async (originDate) => {
      await expect(
        pipe.transform(
          { description: 'Agenda', documentTypeId: 12, originDate },
          boundary,
        ),
      ).rejects.toThrow();
    },
  );
  it('trims optional descriptions and accepts omitted origin', async () => {
    expect(
      await pipe.transform(
        { description: '  Agenda  ', documentTypeId: '12' },
        boundary,
      ),
    ).toMatchObject({ description: 'Agenda', documentTypeId: 12 });
  });
  it('preserves optional untrimmed editing descriptions and academic editing', async () => {
    expect(
      await pipe.transform(
        { description: '  ', academic: { courseId: 3 } },
        { type: 'body', metatype: UpdateDocumentDto },
      ),
    ).toMatchObject({ description: '  ', academic: { courseId: 3 } });
  });
});
