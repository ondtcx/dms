import { Test, TestingModule } from '@nestjs/testing';
import { DocumentCompositionController } from './document-composition.controller';
import { DocumentCompositionService } from './document-composition.service';
import { PdfMergeService } from './pdf-merge.service';
import { AuthGuard } from '../auth/guards/auth.guard';

// Cada ruta debe propagar el actor autenticado; el servicio revalida su vigencia.
describe('DocumentCompositionController actor propagation', () => {
  let controller: DocumentCompositionController;
  const compositionService = {
    getComposition: jest.fn(),
    addComponent: jest.fn(),
    removeComponent: jest.fn(),
    reorder: jest.fn(),
    updateComponent: jest.fn(),
  };
  const pdfMergeService = { merge: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentCompositionController],
      providers: [
        { provide: DocumentCompositionService, useValue: compositionService },
        { provide: PdfMergeService, useValue: pdfMergeService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<DocumentCompositionController>(
      DocumentCompositionController,
    );
  });

  it('forwards the actor on metadata reads', async () => {
    await controller.getComposition(10, { id: 'actor-1' });
    expect(compositionService.getComposition).toHaveBeenCalledWith(
      10,
      'actor-1',
    );
  });

  it('forwards the actor on add', async () => {
    const dto = { childId: 3 };
    await controller.addComponent(10, dto as any, { id: 'actor-1' });
    expect(compositionService.addComponent).toHaveBeenCalledWith(
      10,
      dto,
      'actor-1',
    );
  });

  it('forwards the actor on remove', async () => {
    await controller.removeComponent(10, 3, { id: 'actor-1' });
    expect(compositionService.removeComponent).toHaveBeenCalledWith(
      10,
      3,
      'actor-1',
    );
  });

  it('forwards the actor on reorder', async () => {
    const dto = { items: [{ childId: 3, order: 0 }] };
    await controller.reorder(10, dto as any, { id: 'actor-1' });
    expect(compositionService.reorder).toHaveBeenCalledWith(
      10,
      dto,
      'actor-1',
    );
  });

  it('forwards the actor on update', async () => {
    const dto = { label: 'Acta' };
    await controller.updateComponent(10, 3, dto as any, { id: 'actor-1' });
    expect(compositionService.updateComponent).toHaveBeenCalledWith(
      10,
      3,
      dto,
      'actor-1',
    );
  });

  it('forwards the actor when downloading the merged PDF', async () => {
    const res: any = { set: jest.fn(), end: jest.fn() };
    pdfMergeService.merge.mockResolvedValue(Buffer.from('pdf'));
    await controller.downloadMerged(10, res, { id: 'actor-1' });
    expect(pdfMergeService.merge).toHaveBeenCalledWith(10, 'actor-1');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(res.end).toHaveBeenCalled();
  });
});
