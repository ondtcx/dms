import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import puppeteer, { Browser } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';
import { DocxPdfRenderer } from './docx-pdf-renderer';
import { normalizeDocxPackage } from './docx-package-normalizer';

@Injectable()
export class DocxPreviewRendererService implements DocxPdfRenderer {
  async render(bytes: Buffer): Promise<Buffer> {
    // La política se ejecuta antes de abrir Chromium y antes de cargar docx-preview.
    bytes = await normalizeDocxPackage(bytes);
    const [zipScript, previewScript] = await Promise.all([
      readFile(
        join(dirname(require.resolve('jszip')), '../dist/jszip.min.js'),
        'utf8',
      ),
      readFile(require.resolve('docx-preview'), 'utf8'),
    ]);
    let browser: Browser;
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        browser?.process()?.kill();
        reject(
          new Error('La vista previa DOCX superó el límite de 45 segundos'),
        );
      }, 45000);
    });
    const operation = async () => {
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [],
        timeout: 15000,
      });
      if (expired) {
        browser.process()?.kill();
        throw new Error('La vista previa DOCX expiró');
      }
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(15000);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const allowed =
          !request.isNavigationRequest() &&
          request.resourceType() === 'image' &&
          /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(
            request.url(),
          );
        // El cierre del navegador puede cancelar una solicitud ya interceptada.
        void (allowed ? request.continue() : request.abort()).catch(() => {});
      });
      const nonce = randomBytes(24).toString('base64');
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"></head><body><div id="styles"></div><div id="content"></div></body></html>`,
        { waitUntil: 'domcontentloaded', timeout: 15000 },
      );
      // Solo los bundles instalados reciben el nonce; el archivo subido siempre es un dato.
      for (const content of [zipScript, previewScript]) {
        await page.evaluate(
          ({ content, nonce }) => {
            const script = document.createElement('script');
            script.nonce = nonce;
            script.textContent = content;
            document.head.appendChild(script);
          },
          { content, nonce },
        );
      }
      await page.emulateMediaType('print');
      await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        await (window as any).docx.renderAsync(
          bytes,
          document.getElementById('content'),
          document.getElementById('styles'),
          {
            renderAltChunks: false,
            ignoreFonts: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
            renderComments: false,
            renderChanges: false,
            experimental: false,
            useBase64URL: true,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            ignoreWidth: false,
            ignoreHeight: false,
            inWrapper: true,
            hideWrapperOnPrint: true,
          },
        );
        const container = document.getElementById('content');
        const styles = document.getElementById('styles');
        if (
          new TextEncoder().encode(container.innerHTML + styles.innerHTML)
            .length > 8388608 ||
          container.querySelectorAll('*').length > 200000
        )
          throw new Error('El contenido DOCX supera el límite');
        const pages = container.querySelectorAll('section.docx');
        if (!pages.length || pages.length > 100)
          throw new Error('El DOCX supera el límite de páginas');
        for (const element of [
          ...container.querySelectorAll('*'),
          ...styles.querySelectorAll('*'),
        ]) {
          if (
            [
              'SCRIPT',
              'IFRAME',
              'OBJECT',
              'EMBED',
              'SVG',
              'LINK',
              'META',
              'FORM',
              'INPUT',
              'VIDEO',
              'AUDIO',
            ].includes(element.tagName)
          )
            throw new Error('Elemento DOCX no compatible');
          for (const attribute of [...element.attributes]) {
            if (
              /^on/i.test(attribute.name) ||
              [
                'href',
                'target',
                'srcset',
                'action',
                'formaction',
                'xlink:href',
              ].includes(attribute.name)
            )
              element.removeAttribute(attribute.name);
          }
          if (
            element.hasAttribute('src') &&
            !(
              element.tagName === 'IMG' &&
              /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(
                element.getAttribute('src'),
              )
            )
          )
            throw new Error('Recurso DOCX no compatible');
          const inline = (element as HTMLElement).style;
          if (inline)
            for (const property of [...inline])
              if (
                /url\s*\(|expression\s*\(|javascript:|@import/i.test(
                  inline.getPropertyValue(property),
                )
              )
                throw new Error('CSS DOCX no compatible');
        }
        for (const sheet of [...document.styleSheets]) {
          const inspect = (rules: CSSRuleList) => {
            for (const rule of [...rules]) {
              if (
                /url\s*\(|expression\s*\(|javascript:|@import|@font-face/i.test(
                  rule.cssText,
                )
              )
                throw new Error('CSS DOCX no compatible');
              if ('cssRules' in rule)
                inspect((rule as CSSGroupingRule).cssRules);
            }
          };
          inspect(sheet.cssRules);
        }
        await Promise.all(
          [...container.querySelectorAll('img')].map(async (image) => {
            await image.decode();
            if (
              !image.naturalWidth ||
              image.naturalWidth * image.naturalHeight > 10000000
            )
              throw new Error('Imagen DOCX no compatible');
          }),
        );
        await document.fonts.ready;
        // Los scripts de confianza ya terminaron; ningún script de documento queda activo.
        for (const script of [...document.querySelectorAll('script')])
          script.remove();
        const print = document.createElement('style');
        let pageRules = '';
        let estimatedPages = 0;
        [...pages].forEach((section, index) => {
          const rect = section.getBoundingClientRect();
          const computed = getComputedStyle(section);
          const paperHeight = parseFloat(computed.minHeight);
          const margins = [
            computed.paddingTop,
            computed.paddingRight,
            computed.paddingBottom,
            computed.paddingLeft,
          ].map(parseFloat);
          const [top, right, bottom, left] = margins;
          const contentWidth = rect.width - left - right;
          const contentHeight = paperHeight - top - bottom;
          if (
            !Number.isFinite(rect.width) ||
            rect.width < 200 ||
            rect.width > 2000 ||
            !Number.isFinite(paperHeight) ||
            paperHeight < 200 ||
            paperHeight > 2000 ||
            margins.some(
              (value) => !Number.isFinite(value) || value < 0 || value > 2000,
            ) ||
            contentWidth < 100 ||
            contentHeight < 100
          )
            throw new Error('Dimensiones DOCX no compatibles');
          const name = 'office-page-' + index;
          (section as HTMLElement).style.page = name;
          const height = Math.min(2000, Math.ceil(paperHeight) + 1);
          const width = Math.max(201, Math.ceil(rect.width));
          const overflow = Math.max(rect.height, section.scrollHeight) > height;
          if (overflow) {
            // Chromium fragmenta el flujo; los márgenes pertenecen a cada página física, no a una caja gigante.
            pageRules += `@page ${name}{size:${width}px ${height}px;margin:${top}px ${right}px ${bottom}px ${left}px}`;
            const element = section as HTMLElement;
            element.dataset.fragmented = 'true';
            element.style.width = `${contentWidth}px`;
            element.style.minHeight = '0';
            element.style.padding = '0';
            element.style.display = 'block';
            element.style.overflow = 'visible';
            // Se conservan una sola vez los encabezados/pies existentes; no se clonan para las continuaciones.
            for (const child of section.querySelectorAll<HTMLElement>(
              ':scope>header,:scope>footer',
            )) {
              child.style.marginTop = '0';
              child.style.marginBottom = '0';
            }
          } else {
            pageRules += `@page ${name}{size:${width}px ${height}px;margin:0}`;
          }
          const flowHeight = overflow
            ? Math.max(
                section.getBoundingClientRect().height,
                section.scrollHeight,
              )
            : Math.max(rect.height, section.scrollHeight) - top - bottom;
          estimatedPages += overflow
            ? Math.max(1, Math.ceil(flowHeight / contentHeight))
            : 1;
          if (!Number.isFinite(estimatedPages) || estimatedPages > 100)
            throw new Error('El DOCX supera el límite de páginas');
        });
        print.textContent =
          pageRules +
          'html,body{margin:0!important}#styles{display:none}#content,.docx-wrapper{padding:0!important;display:contents!important}section.docx{box-shadow:none!important;margin:0!important;break-after:page;break-inside:auto}section.docx[data-fragmented]>article{margin-bottom:0!important;break-inside:auto}section.docx:last-child{break-after:auto}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}';
        document.head.appendChild(print);
        if (
          new TextEncoder().encode(
            container.innerHTML + styles.innerHTML + print.textContent,
          ).length > 8388608 ||
          container.querySelectorAll('*').length +
            styles.querySelectorAll('*').length +
            1 >
            200000
        )
          throw new Error('El contenido DOCX supera el límite');
      }, bytes.toString('base64'));
      await page.setJavaScriptEnabled(false);
      const pdf = Buffer.from(
        await page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          timeout: 15000,
        }),
      );
      if (!pdf.length || pdf.length > 20 * 1024 * 1024)
        throw new Error('El PDF supera el límite de 20 MiB');
      const parsedPdf = await PDFDocument.load(pdf);
      if (!parsedPdf.getPageCount() || parsedPdf.getPageCount() > 100)
        throw new Error('El DOCX supera el límite de páginas');
      if (
        parsedPdf.getPages().some((page) => {
          const { width, height } = page.getSize();
          return [width, height].some(
            (points) =>
              !Number.isFinite(points) ||
              (points * 96) / 72 < 200 ||
              (points * 96) / 72 > 2000,
          );
        })
      )
        throw new Error('Dimensiones PDF no compatibles');
      return pdf;
    };
    try {
      return await Promise.race([operation(), deadline]);
    } finally {
      clearTimeout(timer);
      if (browser) {
        let cleanup: ReturnType<typeof setTimeout>;
        try {
          await Promise.race([
            browser.close(),
            new Promise<void>((resolve) => {
              cleanup = setTimeout(() => {
                browser.process()?.kill();
                resolve();
              }, 3000);
            }),
          ]);
        } finally {
          clearTimeout(cleanup);
        }
      }
    }
  }
}
