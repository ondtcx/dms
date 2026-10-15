import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn(),
    images: { dataUri: jest.fn() },
  },
}));

import mammoth from 'mammoth';
import { DirectHtmlPdfRenderer } from '../document-template/direct-html-pdf-renderer';
import { ThumbnailService } from './thumbnail.service';
import { OfficeContentService } from './office-content/office-content.service';

describe('ThumbnailService', () => {
  let service: ThumbnailService;
  let sourceDirectory: string;
  let sourcePath: string;
  let documentGenerator: DirectHtmlPdfRenderer;

  const convertToHtmlMock = mammoth.convertToHtml as jest.Mock;
  const wordMimeType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  beforeEach(() => {
    sourceDirectory = mkdtempSync(
      join(tmpdir(), 'opencode', 'thumbnail-service-test-'),
    );
    sourcePath = join(sourceDirectory, 'example.docx');
    writeFileSync(sourcePath, 'test document');
    documentGenerator = {
      generatePDFFromHtml: jest.fn(),
    };
    service = new ThumbnailService(documentGenerator, {
      convert: convertToHtmlMock,
    } as unknown as OfficeContentService);
    (service as any).thumbnailPath = sourceDirectory;
    convertToHtmlMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(sourceDirectory, { recursive: true, force: true });
  });

  it('converts DOCX to HTML, generates a PDF, and renders the first page', async () => {
    convertToHtmlMock.mockResolvedValue(Buffer.from('test pdf'));
    (documentGenerator.generatePDFFromHtml as jest.Mock).mockResolvedValue(
      Buffer.from('test pdf'),
    );
    const generatePdfThumbnail = jest
      .spyOn(service as any, 'generatePdfThumbnail')
      .mockImplementation(async () => true);
    generatePdfThumbnail.mockImplementation(async (pdfPath, outputPath) => {
      expect(pdfPath).toEqual(Buffer.from('test pdf'));
      writeFileSync(outputPath as string, 'rendered thumbnail');
      return true;
    });

    const thumbnailPath = await service.generateThumbnail(
      sourcePath,
      7,
      wordMimeType,
    );

    expect(thumbnailPath).toBe(join(sourceDirectory, 'thumb_content_v4_7.jpg'));
    expect(convertToHtmlMock).toHaveBeenCalledWith(sourcePath, wordMimeType);
    expect(generatePdfThumbnail).toHaveBeenCalledWith(
      Buffer.from('test pdf'),
      join(sourceDirectory, 'thumb_content_v4_7.jpg'),
    );
  });

  it('falls back to the Word icon when DOCX conversion fails', async () => {
    convertToHtmlMock.mockRejectedValue(new Error('invalid DOCX'));
    const iconThumbnail = jest
      .spyOn(service as any, 'generateIconThumbnail')
      .mockImplementation(async (_mimetype, outputPath) => {
        writeFileSync(outputPath as string, 'fallback thumbnail');
      });
    const warning = jest.spyOn((service as any).logger, 'warn');

    await expect(
      service.generateThumbnail(sourcePath, 8, wordMimeType),
    ).resolves.toBe(join(sourceDirectory, 'thumb_content_v4_8.jpg'));

    expect(iconThumbnail).toHaveBeenCalledWith(
      wordMimeType,
      join(sourceDirectory, 'thumb_content_v4_8.jpg'),
      'DOCX',
    );
    expect(documentGenerator.generatePDFFromHtml).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo convertir el documento Office'),
    );
  });

  it('converts content, ignores v3 fallback caches and preserves old files', async () => {
    const mime =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    writeFileSync(join(sourceDirectory, 'thumb_70.jpg'), 'old Excel icon');
    writeFileSync(
      join(sourceDirectory, 'thumb_content_v3_70.jpg'),
      'old content',
    );
    expect(service.getThumbnailPath(70)).toBeNull();
    convertToHtmlMock.mockResolvedValue(Buffer.from('xlsx content pdf'));
    const render = jest
      .spyOn(service as any, 'generatePdfThumbnail')
      .mockImplementation(async (_pdf, output) => {
        writeFileSync(output as string, 'content thumbnail');
        return true;
      });
    const icon = jest.spyOn(service as any, 'generateIconThumbnail');
    await expect(service.generateThumbnail(sourcePath, 70, mime)).resolves.toBe(
      join(sourceDirectory, 'thumb_content_v4_70.jpg'),
    );
    expect(convertToHtmlMock).toHaveBeenCalledWith(sourcePath, mime);
    expect(render).toHaveBeenCalledWith(
      Buffer.from('xlsx content pdf'),
      expect.any(String),
    );
    expect(icon).not.toHaveBeenCalled();
    expect(existsSync(join(sourceDirectory, 'thumb_content_v3_70.jpg'))).toBe(
      true,
    );
    expect(service.getThumbnailPath(70)).toBe(
      join(sourceDirectory, 'thumb_content_v4_70.jpg'),
    );
  });

  it('uses the Word icon for legacy DOC files', async () => {
    const iconThumbnail = jest
      .spyOn(service as any, 'generateIconThumbnail')
      .mockImplementation(async (_mimetype, outputPath) => {
        writeFileSync(outputPath as string, 'fallback thumbnail');
      });

    await expect(
      service.generateThumbnail(sourcePath, 9, 'application/msword'),
    ).resolves.toBe(join(sourceDirectory, 'thumb_content_v4_9.jpg'));

    expect(iconThumbnail).toHaveBeenCalledWith(
      'application/msword',
      join(sourceDirectory, 'thumb_content_v4_9.jpg'),
      'DOC',
    );
    expect(convertToHtmlMock).not.toHaveBeenCalled();
  });

  it('returns null when conversion and the icon fallback fail', async () => {
    convertToHtmlMock.mockRejectedValue(new Error('converter unavailable'));
    const iconThumbnail = jest
      .spyOn(service as any, 'generateIconThumbnail')
      .mockRejectedValue(new Error('icon rendering failed'));
    const error = jest.spyOn((service as any).logger, 'error');

    await expect(
      service.generateThumbnail(sourcePath, 10, wordMimeType),
    ).resolves.toBeNull();

    expect(iconThumbnail).toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Error generando icono de respaldo'),
    );
    expect(service.getThumbnailPath(10)).toBeNull();
  });

  it('deduplicates concurrent ordinary generations', async () => {
    let resolveGeneration: (value: string | null) => void = () => undefined;
    const generation = new Promise<string | null>((resolve) => {
      resolveGeneration = resolve;
    });
    const generateThumbnailInternal = jest
      .spyOn(service as any, 'generateThumbnailInternal')
      .mockReturnValue(generation);

    const firstRequest = service.generateThumbnail(
      sourcePath,
      11,
      wordMimeType,
    );
    const secondRequest = service.generateThumbnail(
      sourcePath,
      11,
      wordMimeType,
    );

    expect(generateThumbnailInternal).toHaveBeenCalledTimes(1);
    resolveGeneration('thumbnail');

    await expect(firstRequest).resolves.toBe('thumbnail');
    await expect(secondRequest).resolves.toBe('thumbnail');
  });

  it('queues concurrent regenerations instead of deduplicating them', async () => {
    let resolveFirst: (value: string | null) => void = () => undefined;
    const firstGeneration = new Promise<string | null>((resolve) => {
      resolveFirst = resolve;
    });
    const generateThumbnailInternal = jest
      .spyOn(service as any, 'generateThumbnailInternal')
      .mockImplementationOnce(() => firstGeneration)
      .mockResolvedValueOnce('second-thumbnail');
    const deleteThumbnail = jest
      .spyOn(service, 'deleteThumbnail')
      .mockImplementation(() => undefined);

    const firstRegeneration = service.regenerateThumbnail(
      sourcePath,
      12,
      wordMimeType,
    );
    await Promise.resolve();

    const secondRegeneration = service.regenerateThumbnail(
      sourcePath,
      12,
      wordMimeType,
    );

    expect(deleteThumbnail).toHaveBeenCalledTimes(1);
    expect(generateThumbnailInternal).toHaveBeenCalledTimes(1);

    resolveFirst('first-thumbnail');

    await expect(firstRegeneration).resolves.toBe('first-thumbnail');
    await expect(secondRegeneration).resolves.toBe('second-thumbnail');
    expect(deleteThumbnail).toHaveBeenCalledTimes(2);
    expect(generateThumbnailInternal).toHaveBeenCalledTimes(2);
    expect((service as any).thumbnailGenerationLocks.size).toBe(0);
  });
});
