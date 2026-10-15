import { ForbiddenException, ConflictException } from '@nestjs/common';
import * as fs from 'fs';
import { PdfMergeService } from './pdf-merge.service';
import { PDFDocument } from 'pdf-lib';

// Se evita cargar puppeteer en las pruebas aisladas simulando el generador.
jest.mock('../document-template/document-generator.service', () => ({
  DocumentGeneratorService: class DocumentGeneratorService {},
}));
jest.mock('fs');
jest.mock('pdf-lib', () => {
  const createMerged = () => ({
    copyPages: jest.fn(async (_src: any, indices: number[]) =>
      indices.map((index) => ({ index })),
    ),
    addPage: jest.fn(),
    save: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
  });
  return {
    PDFDocument: {
      create: jest.fn(async () => createMerged()),
      load: jest.fn(async () => ({ getPageIndices: () => [0] })),
    },
  };
});

// Pruebas aisladas: base y archivos simulados, sin base de datos ni servicios vivos.
describe('PdfMergeService actor-bound authorization', () => {
  let generator: any;
  let compositionService: any;
  let service: PdfMergeService;

  const pdfChild = (id: number, overrides: Record<string, any> = {}) => ({
    id,
    versions: [
      {
        id: 1,
        filename: `doc-${id}.pdf`,
        mimetype: 'application/pdf',
        path: `C:/uploads/doc-${id}.pdf`,
      },
    ],
    templateData: null,
    ...overrides,
  });

  function snapshot(components: any[]) {
    return {
      parentId: 10,
      origin: null,
      signature: 'origin:none|3:1:none',
      components,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(Buffer.from('pdf'));
    generator = { generatePDF: jest.fn(async () => Buffer.from('generated')) };
    compositionService = {
      authorizeMergeSnapshot: jest.fn(),
      recheckMergeSnapshot: jest.fn(),
    };
    service = new PdfMergeService(generator, compositionService);
  });

  it('authorizes before any file read or template generation', async () => {
    compositionService.authorizeMergeSnapshot.mockRejectedValue(
      new ForbiddenException('No tienes acceso a un componente'),
    );
    await expect(service.merge(10, 'actor-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(compositionService.authorizeMergeSnapshot).toHaveBeenCalledWith(
      10,
      'actor-1',
    );
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(generator.generatePDF).not.toHaveBeenCalled();
    expect(PDFDocument.create).not.toHaveBeenCalled();
  });

  it('merges authorized PDF bytes and rechecks before returning', async () => {
    compositionService.authorizeMergeSnapshot.mockResolvedValue(
      snapshot([{ order: 0, child: pdfChild(3) }]),
    );
    compositionService.recheckMergeSnapshot.mockResolvedValue(undefined);

    const buffer = await service.merge(10, 'actor-1');
    expect(fs.readFileSync).toHaveBeenCalledWith('C:/uploads/doc-3.pdf');
    expect(compositionService.recheckMergeSnapshot).toHaveBeenCalledWith(
      10,
      'actor-1',
      'origin:none|3:1:none',
    );
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('does not publish bytes when the final recheck denies access', async () => {
    compositionService.authorizeMergeSnapshot.mockResolvedValue(
      snapshot([{ order: 0, child: pdfChild(3) }]),
    );
    compositionService.recheckMergeSnapshot.mockRejectedValue(
      new ConflictException('La composición cambió durante la generación'),
    );

    await expect(service.merge(10, 'actor-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('regenerates template components from the authorized snapshot', async () => {
    compositionService.authorizeMergeSnapshot.mockResolvedValue(
      snapshot([
        {
          order: 0,
          child: {
            id: 3,
            versions: [],
            templateData: {
              templateId: 5,
              formData: { nombre: 'Ana' },
              template: {
                id: 5,
                htmlTemplate: '<p>{{nombre}}</p>',
                styles: 'p{color:red}',
                pageSize: 'A4',
                orientation: 'portrait',
              },
            },
          },
        },
      ]),
    );
    compositionService.recheckMergeSnapshot.mockResolvedValue(undefined);

    await service.merge(10, 'actor-1');
    expect(generator.generatePDF).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlTemplate: '<p>{{nombre}}</p>',
        data: { nombre: 'Ana' },
      }),
    );
  });

  it('denies the merge when the recheck revokes the actor', async () => {
    compositionService.authorizeMergeSnapshot.mockResolvedValue(
      snapshot([{ order: 0, child: pdfChild(3) }]),
    );
    compositionService.recheckMergeSnapshot.mockRejectedValue(
      new ForbiddenException('No tienes acceso a un componente'),
    );

    await expect(service.merge(10, 'actor-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
