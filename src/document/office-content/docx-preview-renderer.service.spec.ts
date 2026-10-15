import { DocxPreviewRendererService } from './docx-preview-renderer.service';
import PizZip from 'pizzip';
import puppeteer from 'puppeteer';
import * as normalizer from './docx-package-normalizer';
import { PDFDocument } from 'pdf-lib';

describe('Isolated DOCX renderer', () => {
  it('injects only local trusted scripts into a fresh sandbox and denies navigation and remote requests', async () => {
    const normalized = Buffer.from('normalized package data');
    const pdfDocument = jest.spyOn(PDFDocument, 'load').mockResolvedValue({
      getPageCount: () => 1,
      getPages: () => [{ getSize: () => ({ width: 612, height: 792 }) }],
    } as any);
    const validate = jest
      .spyOn(normalizer, 'normalizeDocxPackage')
      .mockResolvedValue(normalized);
    const page = {
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      setContent: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(undefined),
      emulateMediaType: jest.fn().mockResolvedValue(undefined),
      setJavaScriptEnabled: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    };
    const context = { newPage: jest.fn().mockResolvedValue(page) };
    const browser = {
      createBrowserContext: jest.fn().mockResolvedValue(context),
      close: jest.fn().mockResolvedValue(undefined),
      process: jest.fn(),
    };
    const launch = jest
      .spyOn(puppeteer, 'launch')
      .mockResolvedValue(browser as any);
    try {
      const bytes = Buffer.from('document bytes are data');
      await expect(
        new DocxPreviewRendererService().render(bytes),
      ).resolves.toEqual(Buffer.from('%PDF-test'));
      expect(validate).toHaveBeenCalledWith(bytes);
      expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({ args: [] }),
      );
      const shell = page.setContent.mock.calls[0][0];
      expect(shell).toContain("default-src 'none'");
      expect(shell).toContain("font-src 'none'");
      expect(shell).not.toContain(bytes.toString());
      expect(page.evaluate.mock.calls).toHaveLength(3);
      expect(page.evaluate.mock.calls[2][1]).toBe(
        normalized.toString('base64'),
      );
      const trustedRender = page.evaluate.mock.calls[2][0].toString();
      expect(trustedRender).toContain('renderAltChunks: false');
      expect(trustedRender).toContain('ignoreFonts: true');
      expect(trustedRender).toContain('estimatedPages');
      expect(trustedRender).toContain('paperHeight');
      expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
      expect(
        page.setJavaScriptEnabled.mock.invocationCallOrder[0],
      ).toBeLessThan(page.pdf.mock.invocationCallOrder[0]);
      const intercept = page.on.mock.calls.find(
        ([name]) => name === 'request',
      )[1];
      for (const [url, type, navigation, allowed] of [
        ['https://invalid.example', 'image', false, false],
        ['file:///private', 'document', true, false],
        ['data:image/png;base64,YQ==', 'image', false, true],
        ['data:text/html;base64,YQ==', 'document', true, false],
        ['data:image/svg+xml;base64,YQ==', 'image', false, false],
      ] as const) {
        const request = {
          url: () => url,
          resourceType: () => type,
          isNavigationRequest: () => navigation,
          continue: jest.fn().mockResolvedValue(undefined),
          abort: jest.fn().mockResolvedValue(undefined),
        };
        intercept(request);
        expect(
          allowed ? request.continue : request.abort,
        ).toHaveBeenCalledTimes(1);
      }
      expect(browser.close).toHaveBeenCalledTimes(1);
    } finally {
      launch.mockRestore();
      validate.mockRestore();
      pdfDocument.mockRestore();
    }
  });
  it('rejects unsafe packages before launching Chromium', async () => {
    const launch = jest.spyOn(puppeteer, 'launch');
    try {
      const zip = new PizZip();
      zip.file('[Content_Types].xml', '<Types/>');
      zip.file('word/document.xml', '<document/>');
      zip.file('word/media/image.svg', '<svg/>');
      await expect(
        new DocxPreviewRendererService().render(
          zip.generate({ type: 'nodebuffer' }),
        ),
      ).rejects.toThrow();
      expect(launch).not.toHaveBeenCalled();
    } finally {
      launch.mockRestore();
    }
  });

  it.each([
    [0, 612, 792, 'límite de páginas'],
    [101, 612, 792, 'límite de páginas'],
    [1, 1600, 792, 'Dimensiones PDF'],
    [1, 612, 1600, 'Dimensiones PDF'],
    [1, 149, 792, 'Dimensiones PDF'],
    [1, 612, Number.NaN, 'Dimensiones PDF'],
  ])(
    'rejects actual PDF bounds even when the DOM estimate passes (%s pages, %s x %s points)',
    async (count, width, height, message) => {
      const normalize = jest
        .spyOn(normalizer, 'normalizeDocxPackage')
        .mockResolvedValue(Buffer.from('synthetic package'));
      const load = jest.spyOn(PDFDocument, 'load').mockResolvedValue({
        getPageCount: () => count,
        getPages: () => [{ getSize: () => ({ width, height }) }],
      } as any);
      const page = {
        setDefaultTimeout: jest.fn(),
        setDefaultNavigationTimeout: jest.fn(),
        setRequestInterception: jest.fn(),
        on: jest.fn(),
        setContent: jest.fn(),
        evaluate: jest.fn(),
        emulateMediaType: jest.fn(),
        setJavaScriptEnabled: jest.fn(),
        pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-synthetic')),
      };
      const close = jest.fn();
      const launch = jest.spyOn(puppeteer, 'launch').mockResolvedValue({
        createBrowserContext: async () => ({ newPage: async () => page }),
        close,
      } as any);
      try {
        await expect(
          new DocxPreviewRendererService().render(Buffer.alloc(0)),
        ).rejects.toThrow(message as string);
        expect(page.pdf).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledTimes(1);
      } finally {
        launch.mockRestore();
        load.mockRestore();
        normalize.mockRestore();
      }
    },
  );

  it('kills a stalled browser at the hard deadline and bounds cleanup', async () => {
    jest.useFakeTimers();
    const validate = jest
      .spyOn(normalizer, 'normalizeDocxPackage')
      .mockImplementation(async (bytes) => Buffer.from(bytes));
    const kill = jest.fn();
    const close = jest.fn(() => new Promise<void>(() => {}));
    const launch = jest.spyOn(puppeteer, 'launch').mockResolvedValue({
      createBrowserContext: jest.fn(() => new Promise(() => {})),
      process: () => ({ kill }),
      close,
    } as any);
    try {
      const result = new DocxPreviewRendererService().render(Buffer.alloc(0));
      const outcome = expect(result).rejects.toThrow('45 segundos');
      // La lectura de bundles usa E/S real antes del temporizador del navegador.
      await jest.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 100 && !launch.mock.calls.length; i++)
        await new Promise((resolve) =>
          jest.requireActual('node:timers').setTimeout(resolve, 10),
        );
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({ args: [], headless: true }),
      );
      await jest.advanceTimersByTimeAsync(48000);
      await outcome;
      expect(kill).toHaveBeenCalled();
      expect(close).toHaveBeenCalled();
    } finally {
      launch.mockRestore();
      validate.mockRestore();
      jest.useRealTimers();
    }
  });
});
