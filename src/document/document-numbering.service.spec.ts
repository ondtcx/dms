import { DocumentNumberingService } from './document-numbering.service';

describe('DocumentNumberingService assignment', () => {
  let prisma: any;
  let service: DocumentNumberingService;
  let sequence: number;

  beforeEach(() => {
    sequence = 0;
    prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({ documentNumber: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      documentCounter: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockImplementation(async () => ({ lastNumber: ++sequence })),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(prisma)),
    };
    service = new DocumentNumberingService(prisma);
  });

  it('returns a manual number without consuming a counter', async () => {
    prisma.document.findUnique.mockResolvedValue({ documentNumber: 'Manual / 7' });
    await expect(service.assignNumber(1)).resolves.toBe('Manual / 7');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips a generated value occupied by a manual number', async () => {
    prisma.document.updateMany.mockRejectedValueOnce({ code: 'P2002' });
    const result = await service.assignNumber(1);
    expect(result).toBe(`DOC-GEN-${new Date().getFullYear()}-0002`);
    expect(prisma.document.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, documentNumber: null },
      data: { documentNumber: result },
    });
  });

  it('preserves a concurrently assigned number on the same document', async () => {
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    prisma.document.findUnique
      .mockResolvedValueOnce({ documentNumber: null })
      .mockResolvedValueOnce({ documentNumber: 'Concurrent / 9' });
    await expect(service.assignNumber(1)).resolves.toBe('Concurrent / 9');
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('bounds collision retries', async () => {
    prisma.document.updateMany.mockRejectedValue({ code: 'P2002' });
    await expect(service.assignNumber(1)).rejects.toThrow(
      'No se pudo asignar un número institucional automático',
    );
    expect(prisma.document.updateMany).toHaveBeenCalledTimes(100);
  });

  it('does not retry unrelated database errors', async () => {
    const error = new Error('database unavailable');
    prisma.document.updateMany.mockRejectedValue(error);
    await expect(service.assignNumber(1)).rejects.toBe(error);
    expect(prisma.document.updateMany).toHaveBeenCalledTimes(1);
  });
});
