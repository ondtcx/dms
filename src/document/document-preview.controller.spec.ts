import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DocumentPreviewController } from './document-preview.controller';
import { DocumentService } from './document.service';
import {
  OfficeContentService,
  DOCX_MIME,
} from './office-content/office-content.service';

describe('DocumentPreviewController', () => {
  const documents = { view: jest.fn(), findOne: jest.fn() };
  const office = { convert: jest.fn() };
  const response = { set: jest.fn() };
  const controller = new DocumentPreviewController(
    documents as unknown as DocumentService,
    office as unknown as OfficeContentService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    documents.findOne.mockResolvedValue({ id: 1 });
  });

  it('rechecks live read after conversion and emits nothing after revocation', async () => {
    documents.view.mockResolvedValue({ path: 'authorized.docx', mimetype: DOCX_MIME });
    office.convert.mockResolvedValue(Buffer.from('%PDF-1.7'));
    const revoked = new ForbiddenException('Acceso revocado');
    documents.findOne.mockRejectedValue(revoked);
    await expect(controller.preview(1, { id: 'user', role: 'USER' }, response as any)).rejects.toBe(revoked);
    expect(office.convert).toHaveBeenCalledTimes(1);
    expect(response.set).not.toHaveBeenCalled();
  });

  it.each([
    new ForbiddenException(),
    new BadRequestException('integrity failure'),
  ])('does not convert after access or integrity rejection', async (error) => {
    documents.view.mockRejectedValue(error);
    await expect(
      controller.preview(1, { id: 'user', role: 'USER' }, response as any),
    ).rejects.toBe(error);
    expect(office.convert).not.toHaveBeenCalled();
    expect(response.set).not.toHaveBeenCalled();
  });

  it('converts only the authorized original and returns private PDF headers', async () => {
    documents.view.mockResolvedValue({
      path: 'authorized.docx',
      mimetype: DOCX_MIME,
    });
    office.convert.mockResolvedValue(Buffer.from('%PDF-1.7'));
    const result = await controller.preview(
      1,
      { id: 'user', role: 'USER' },
      response as any,
    );
    expect(documents.view).toHaveBeenCalledWith(1, 'user', 'USER');
    expect(office.convert).toHaveBeenCalledWith('authorized.docx', DOCX_MIME);
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="preview.pdf"',
      }),
    );
    expect(documents.findOne).toHaveBeenCalledWith(1, 'user', 'USER');
    expect(office.convert.mock.invocationCallOrder[0]).toBeLessThan(documents.findOne.mock.invocationCallOrder[0]);
    expect(result).toBeDefined();
  });
});
