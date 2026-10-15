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

  it('isolates untrusted rendering, blocks network/file requests and closes the browser', async () => {
    const page = {
      setJavaScriptEnabled: jest.fn(),
      setRequestInterception: jest.fn(),
      on: jest.fn(),
      setDefaultTimeout: jest.fn(),
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn(),
      process: jest.fn().mockReturnValue({ kill: jest.fn() }),
    };
    launchMock.mockResolvedValue(browser);
    const service = new DocumentGeneratorService();
    await service.generatePDFFromHtml({ html: '<p>safe</p>', untrusted: true });
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    const handler = page.on.mock.calls[0][1];
    for (const url of [
      'https://invalid.example',
      'file:///etc/passwd',
      'data:image/svg+xml;base64,PHN2Zz4=',
    ]) {
      const request = { url: () => url, abort: jest.fn(), continue: jest.fn() };
      handler(request);
      expect(request.abort).toHaveBeenCalled();
    }
    const image = {
      url: () => 'data:image/png;base64,YQ==',
      abort: jest.fn(),
      continue: jest.fn(),
    };
    handler(image);
    expect(image.continue).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });

  it('closes the browser when untrusted rendering fails', async () => {
    const browser = {
      process: jest.fn().mockReturnValue({ kill: jest.fn() }),
      newPage: jest.fn().mockRejectedValue(new Error('page failed')),
      close: jest.fn(),
    };
    launchMock.mockResolvedValue(browser);
    await expect(
      new DocumentGeneratorService().generatePDFFromHtml({
        html: '<p>safe</p>',
        untrusted: true,
      }),
    ).rejects.toThrow('page failed');
    expect(browser.close).toHaveBeenCalled();
  });

  it('preserves trusted renderer semantics', async () => {
    const page = {
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      setJavaScriptEnabled: jest.fn(),
      setRequestInterception: jest.fn(),
    };
    const browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn(),
    };
    launchMock.mockResolvedValue(browser);
    await new DocumentGeneratorService().generatePDFFromHtml({
      html: '<p>{{literal}}</p>',
    });
    expect(page.setJavaScriptEnabled).not.toHaveBeenCalled();
    expect(page.setRequestInterception).not.toHaveBeenCalled();
    expect(page.setContent).toHaveBeenCalledWith(
      expect.stringContaining('{{literal}}'),
      { waitUntil: 'networkidle0' },
    );
  });
});
