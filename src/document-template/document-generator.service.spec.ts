jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn(),
  },
}));

import puppeteer from 'puppeteer';
import { DocumentGeneratorService } from './document-generator.service';

describe('DocumentGeneratorService', () => {
  const launchMock = puppeteer.launch as jest.Mock;

  beforeEach(() => {
    launchMock.mockReset();
  });

  it('wraps asynchronous Puppeteer failures in the existing PDF error', async () => {
    launchMock.mockRejectedValue(new Error('browser unavailable'));
    const service = new DocumentGeneratorService();

    await expect(
      service.generatePDF({
        htmlTemplate: '<p>Contenido</p>',
        data: {},
      }),
    ).rejects.toThrow('Error al generar PDF: browser unavailable');
  });
});
