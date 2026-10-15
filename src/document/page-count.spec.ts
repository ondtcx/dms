import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { readVersionPageCount } from './page-count';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('readVersionPageCount', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'page-count-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const writePdf = async (pages: number, name = `document-${pages}.pdf`) => {
    const document = await PDFDocument.create();
    for (let index = 0; index < pages; index++) document.addPage();
    const path = join(directory, name);
    await writeFile(path, await document.save());
    return path;
  };

  const pdfBuffer = async (pages: number) => {
    const document = await PDFDocument.create();
    for (let index = 0; index < pages; index++) document.addPage();
    return Buffer.from(await document.save());
  };

  it('reads the real page count of a PDF file', async () => {
    const path = await writePdf(3);

    await expect(readVersionPageCount(path, 'application/pdf')).resolves.toBe(
      3,
    );
  });

  it('returns null when the PDF cannot be parsed instead of throwing', async () => {
    const path = join(directory, 'broken.pdf');
    await writeFile(path, 'esto no es un PDF');

    await expect(
      readVersionPageCount(path, 'application/pdf'),
    ).resolves.toBeNull();
  });

  it('returns null when the file does not exist', async () => {
    await expect(
      readVersionPageCount(join(directory, 'missing.pdf'), 'application/pdf'),
    ).resolves.toBeNull();
  });

  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'counts a single page for %s',
    async (mimetype) => {
      const path = join(directory, 'scan.bin');
      await writeFile(path, 'bytes');

      await expect(readVersionPageCount(path, mimetype)).resolves.toBe(1);
    },
  );

  it('returns null for image formats that can hold several pages', async () => {
    const path = join(directory, 'scan.tiff');
    await writeFile(path, 'bytes');

    await expect(readVersionPageCount(path, 'image/tiff')).resolves.toBeNull();
  });

  it('counts the pages of the converted Office document', async () => {
    const path = join(directory, 'document.docx');
    await writeFile(path, 'bytes');
    const convertToPdf = jest.fn().mockResolvedValue(await pdfBuffer(4));

    await expect(
      readVersionPageCount(path, DOCX_MIME, { convertToPdf }),
    ).resolves.toBe(4);
    expect(convertToPdf).toHaveBeenCalledWith(path, DOCX_MIME);
  });

  it('returns null for an Office document when no converter is available', async () => {
    const path = join(directory, 'document.docx');
    await writeFile(path, 'bytes');

    await expect(readVersionPageCount(path, DOCX_MIME)).resolves.toBeNull();
  });

  it('returns null when the conversion fails or returns no readable pages', async () => {
    const path = join(directory, 'document.docx');
    await writeFile(path, 'bytes');
    const convertToPdf = jest
      .fn()
      .mockRejectedValue(new Error('sin conversión'));

    await expect(
      readVersionPageCount(path, DOCX_MIME, { convertToPdf }),
    ).resolves.toBeNull();

    convertToPdf.mockResolvedValue(Buffer.from('tampoco es un PDF'));
    await expect(
      readVersionPageCount(path, DOCX_MIME, { convertToPdf }),
    ).resolves.toBeNull();
  });

  it('returns null for unsupported formats without converting them', async () => {
    const path = join(directory, 'archive.zip');
    await writeFile(path, 'bytes');
    const convertToPdf = jest.fn();

    await expect(
      readVersionPageCount(path, 'application/zip', { convertToPdf }),
    ).resolves.toBeNull();
    expect(convertToPdf).not.toHaveBeenCalled();
  });

  it('returns null for an empty or unknown mimetype', async () => {
    const path = await writePdf(1, 'unknown.bin');

    await expect(readVersionPageCount(path, '')).resolves.toBeNull();
    await expect(
      readVersionPageCount(path, 'application/octet-stream'),
    ).resolves.toBeNull();
  });
});
