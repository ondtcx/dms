import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { DocumentPageCountService } from './document-page-count.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { OfficeContentService } from './office-content/office-content.service';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('DocumentPageCountService', () => {
  let directory: string;
  const update = jest.fn();
  const convert = jest.fn();

  const service = () =>
    new DocumentPageCountService(
      { documentVersion: { update } } as unknown as PrismaService,
      { convert } as unknown as OfficeContentService,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    update.mockResolvedValue({});
    directory = await mkdtemp(join(tmpdir(), 'page-count-service-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const writePdf = async (pages: number, name: string) => {
    const document = await PDFDocument.create();
    for (let index = 0; index < pages; index++) document.addPage();
    const path = join(directory, name);
    await writeFile(path, await document.save());
    return path;
  };

  it('stores the measured count on the version', async () => {
    const path = await writePdf(2, 'acta.pdf');

    await expect(
      service().record({ id: 11, path, mimetype: 'application/pdf' }),
    ).resolves.toBe(2);

    expect(update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { pageCount: 2 },
    });
  });

  it('stores nothing when the format cannot be measured', async () => {
    const path = join(directory, 'notas.txt');
    await writeFile(path, 'contenido');

    await expect(
      service().record({ id: 12, path, mimetype: 'text/plain' }),
    ).resolves.toBeNull();

    expect(update).not.toHaveBeenCalled();
  });

  it('measures Office documents through the preview conversion', async () => {
    const path = join(directory, 'informe.docx');
    await writeFile(path, 'bytes');
    convert.mockResolvedValue(
      Buffer.from(
        await (async () => {
          const document = await PDFDocument.create();
          for (let index = 0; index < 5; index++) document.addPage();
          return document.save();
        })(),
      ),
    );

    await service().record({ id: 13, path, mimetype: DOCX_MIME });

    expect(convert).toHaveBeenCalledWith(path, DOCX_MIME);
    expect(update).toHaveBeenCalledWith({
      where: { id: 13 },
      data: { pageCount: 5 },
    });
  });

  it('never throws when the metadata cannot be stored', async () => {
    const path = await writePdf(1, 'constancia.pdf');
    update.mockRejectedValue(new Error('base de datos no disponible'));

    await expect(
      service().record({ id: 14, path, mimetype: 'application/pdf' }),
    ).resolves.toBeNull();
  });

  it('never throws when the conversion fails', async () => {
    const path = join(directory, 'roto.docx');
    await writeFile(path, 'bytes');
    convert.mockRejectedValue(new Error('conversión no disponible'));

    await expect(
      service().record({ id: 15, path, mimetype: DOCX_MIME }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
