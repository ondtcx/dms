import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

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

describe('ThumbnailService', () => {
  let service: ThumbnailService;
  let sourceDirectory: string;
  let sourcePath: string;
  let documentGenerator: DirectHtmlPdfRenderer;

  const convertToHtmlMock = mammoth.convertToHtml as jest.Mock;
  const wordMimeType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  beforeEach(() => {
    sourceDirectory = mkdtempSync(join(tmpdir(), 'thumbnail-service-test-'));
    sourcePath = join(sourceDirectory, 'example.docx');
    writeFileSync(sourcePath, 'test document');
    documentGenerator = {
      generatePDFFromHtml: jest.fn(),
    };
    service = new ThumbnailService(documentGenerator);
    (service as any).thumbnailPath = sourceDirectory;
    convertToHtmlMock.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(sourceDirectory, { recursive: true, force: true });
  });

  it('converts DOCX to HTML, generates a PDF, and renders the first page', async () => {
    const convertedHtml = '<p>Word {{literal}}</p>';
    convertToHtmlMock.mockResolvedValue({ value: convertedHtml, messages: [] });
    (documentGenerator.generatePDFFromHtml as jest.Mock).mockResolvedValue(
      Buffer.from('test pdf'),
    );
    const generatePdfThumbnail = jest
      .spyOn(service as any, 'generatePdfThumbnail')
      .mockImplementation(async () => true);
    let temporaryPdfPath: string | undefined;
    generatePdfThumbnail.mockImplementation(async (pdfPath, outputPath) => {
      temporaryPdfPath = pdfPath as string;
      writeFileSync(outputPath as string, 'rendered thumbnail');
      return true;
    });

    const thumbnailPath = await service.generateThumbnail(
      sourcePath,
      7,
      wordMimeType,
    );

    expect(thumbnailPath).toBe(join(sourceDirectory, 'thumb_7.jpg'));
    expect(convertToHtmlMock).toHaveBeenCalledWith(
      { path: sourcePath },
      expect.objectContaining({ convertImage: mammoth.images.dataUri }),
    );
    expect(documentGenerator.generatePDFFromHtml).toHaveBeenCalledWith({
      html: convertedHtml,
    });
    expect(generatePdfThumbnail).toHaveBeenCalledWith(
      expect.stringMatching(/dms-docx-thumbnail-.+document\.pdf$/),
      join(sourceDirectory, 'thumb_7.jpg'),
    );
    expect(temporaryPdfPath).toBeDefined();
    expect(existsAfterCleanup(temporaryPdfPath as string)).toBe(false);
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
    ).resolves.toBe(join(sourceDirectory, 'thumb_8.jpg'));

    expect(iconThumbnail).toHaveBeenCalledWith(
      wordMimeType,
      join(sourceDirectory, 'thumb_8.jpg'),
      'DOCX',
    );
    expect(documentGenerator.generatePDFFromHtml).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo convertir el documento Word'),
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
    ).resolves.toBe(join(sourceDirectory, 'thumb_9.jpg'));

    expect(iconThumbnail).toHaveBeenCalledWith(
      'application/msword',
      join(sourceDirectory, 'thumb_9.jpg'),
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

    const firstRequest = service.generateThumbnail(sourcePath, 11, wordMimeType);
    const secondRequest = service.generateThumbnail(sourcePath, 11, wordMimeType);

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

function existsAfterCleanup(filePath: string): boolean {
  return existsSync(dirname(filePath));
}
