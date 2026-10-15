import {
  OfficeContentService,
  sanitizeOfficeHtml,
  validateOfficeZip,
} from './office-content.service';
import PizZip from 'pizzip';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { DocumentGeneratorService } from '../../document-template/document-generator.service';
import { DOCX_MIME, XLSX_MIME } from './office-content.service';
import { EventEmitter } from 'node:events';
import { DocxPreviewRendererService } from './docx-preview-renderer.service';
import { PDFDocument } from 'pdf-lib';
import { execFile, spawn } from 'node:child_process';

describe('OfficeContentService', () => {
  it('uses the dedicated DOCX renderer and enforces its PDF output bound', async () => {
    const workspace = await mkdtemp(
      join(
        'C:\\Users\\diego\\AppData\\Local\\Temp\\opencode',
        'office-routing-',
      ),
    );
    const zip = new PizZip();
    zip.file('word/document.xml', '<document/>');
    const bytes = zip.generate({ type: 'nodebuffer' });
    const path = join(workspace, 'synthetic.docx');
    await writeFile(path, bytes);
    const html = { generatePDFFromHtml: jest.fn() };
    const docx = {
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    };
    const office = new OfficeContentService(html, docx);
    await expect(office.convert(path, DOCX_MIME)).resolves.toEqual(
      Buffer.from('%PDF-test'),
    );
    expect(docx.render).toHaveBeenCalledWith(bytes);
    expect(html.generatePDFFromHtml).not.toHaveBeenCalled();
    for (const invalid of [
      Buffer.alloc(0),
      Buffer.alloc(20 * 1024 * 1024 + 1),
    ]) {
      docx.render.mockResolvedValueOnce(invalid);
      await expect(office.convert(path, DOCX_MIME)).rejects.toThrow('20 MiB');
      expect((office as any).active).toBe(0);
    }
  });
  it('terminates a stalled parser rather than only racing its result', async () => {
    jest.useFakeTimers();
    const worker = Object.assign(new EventEmitter(), {
      terminate: jest.fn().mockResolvedValue(1),
    });
    const create = jest
      .spyOn(require('node:worker_threads'), 'Worker')
      .mockImplementation(() => worker);
    try {
      const service = new OfficeContentService(
        {
          generatePDFFromHtml: jest.fn(),
        },
        { render: jest.fn() },
      );
      const outcome = expect(
        (service as any).parse(Buffer.alloc(0), DOCX_MIME),
      ).rejects.toThrow('15 segundos');
      jest.advanceTimersByTime(15000);
      await outcome;
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(worker.listenerCount('message')).toBe(0);
    } finally {
      create.mockRestore();
      jest.useRealTimers();
    }
  });
  it('rejects legacy formats before reading files', async () => {
    const renderer = { generatePDFFromHtml: jest.fn() };
    const service = new OfficeContentService(renderer, { render: jest.fn() });
    await expect(
      service.convert('missing.doc', 'application/msword'),
    ).rejects.toThrow('no compatible');
    expect(renderer.generatePDFFromHtml).not.toHaveBeenCalled();
  });

  it('removes executable markup, CSS, external links and SVG images', () => {
    const html = sanitizeOfficeHtml(
      '<script>bad()</script><iframe src="file:///x"></iframe><p onclick="bad()" style="background:url(https://x)">safe<a href="https://x">link</a></p><img src="data:image/svg+xml;base64,PHN2Zz4="/><img src="https://x"/><img src="data:image/png;base64,YQ=="/>',
    );
    expect(html).toContain('safelink');
    expect(html).toContain('data:image/png;base64,YQ==');
    expect(html).not.toMatch(/script|iframe|onclick|style=|https:|file:|svg/);
  });

  it('rejects corrupt and oversized sources before parsing', () => {
    expect(() => validateOfficeZip(Buffer.from('not zip'))).toThrow('corrupto');
    expect(() => validateOfficeZip(Buffer.alloc(10 * 1024 * 1024 + 1))).toThrow(
      '10 MiB',
    );
  });

  it('checks declared ZIP expansion before decompressing', () => {
    const zip = new PizZip();
    zip.file('test.txt', 'hello');
    const bytes = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    expect(() => validateOfficeZip(bytes)).not.toThrow();
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(17 * 1024 * 1024, central + 24);
    expect(() => validateOfficeZip(bytes)).toThrow('expansión');
  });

  it('rejects dishonest declared ZIP sizes with bounded decompression', () => {
    const zip = new PizZip();
    zip.file('test.txt', 'a'.repeat(10000));
    const bytes = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(1, central + 24);
    expect(() => validateOfficeZip(bytes)).toThrow();
  });

  it('rejects overload without allocating a conversion queue', async () => {
    const service = new OfficeContentService(
      {
        generatePDFFromHtml: jest.fn(),
      },
      { render: jest.fn() },
    );
    (service as any).active = 2;
    await expect(
      service.convert(
        'missing',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).rejects.toThrow('ocupada');
  });

  it('rejects corrupt file contents, releases the conversion slot and never renders', async () => {
    const workspace = await mkdtemp(
      join(
        'C:\\Users\\diego\\AppData\\Local\\Temp\\opencode',
        'office-corrupt-',
      ),
    );
    const path = join(workspace, 'corrupt.docx');
    await writeFile(path, 'not a ZIP');
    const renderer = { generatePDFFromHtml: jest.fn() };
    const service = new OfficeContentService(renderer, { render: jest.fn() });
    await expect(service.convert(path, DOCX_MIME)).rejects.toThrow('corrupto');
    expect(renderer.generatePDFFromHtml).not.toHaveBeenCalled();
    expect((service as any).active).toBe(0);
  });
});

const chromiumAvailable = existsSync(
  process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
);
(chromiumAvailable ? describe : describe.skip)(
  'Synthetic local Office rendering smoke',
  () => {
    it('fragments overflowing DOCX into bounded physical pages without losing or duplicating text', async () => {
      const zip = new PizZip();
      zip.file(
        '_rels/.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      );
      zip.file(
        '[Content_Types].xml',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      );
      zip.file(
        'word/_rels/document.xml.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="header" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header.xml"/><Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer.xml"/></Relationships>',
      );
      zip.file(
        'word/header.xml',
        '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>OVERFLOW HEADER</w:t></w:r></w:p></w:hdr>',
      );
      zip.file(
        'word/footer.xml',
        '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>OVERFLOW FOOTER</w:t></w:r></w:p></w:ftr>',
      );
      const paragraphs = Array.from(
        { length: 80 },
        (_, i) =>
          `<w:p><w:r><w:t>SYNTHETIC OVERFLOW ${i} ${'bounded synthetic paragraph '.repeat(20)}</w:t></w:r></w:p>`,
      ).join('');
      const table =
        '<w:tbl>' +
        Array.from(
          { length: 120 },
          (_, i) =>
            `<w:tr><w:tc><w:p><w:r><w:t>SYNTHETIC ROW ${i}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${'Bounded table cell '.repeat(4)}</w:t></w:r></w:p></w:tc></w:tr>`,
        ).join('') +
        '</w:tbl>';
      zip.file(
        'word/document.xml',
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs}${table}<w:p><w:fldSimple w:instr="SEQ Figure \\* ARABIC"><w:r><w:t>FINAL CACHED RESULT</w:t></w:r></w:fldSimple></w:p><w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
      );
      const pdf = await new DocxPreviewRendererService().render(
        zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
      );
      const physical = await PDFDocument.load(pdf);
      for (const page of physical.getPages()) {
        for (const points of Object.values(page.getSize())) {
          expect((points * 96) / 72).toBeGreaterThanOrEqual(200);
          expect((points * 96) / 72).toBeLessThanOrEqual(2000);
        }
      }
      const result = await new Promise<{
        pages: number;
        complete: boolean;
        tableComplete: boolean;
        finalCount: number;
        headerCount: number;
        footerCount: number;
      }>((resolve, reject) => {
        const source = `const chunks=[];
          process.stdin.on('data', chunk=>chunks.push(chunk));
          process.stdin.on('end', ()=>{(async()=>{
            const parser=new (require('pdf-parse').PDFParse)({data:new Uint8Array(Buffer.concat(chunks))});
            let metadata;
            try {
              const result=await parser.getText();
              const text=result.text.replace(/\\s+/g,' ');
              metadata={
                pages:result.total,
                complete:Array.from({length:80},(_,i)=>new RegExp('SYNTHETIC OVERFLOW '+i+'(?:\\\\s|$)').test(text)).every(Boolean),
                tableComplete:Array.from({length:120},(_,i)=>new RegExp('SYNTHETIC ROW '+i+'(?:\\\\s|$)').test(text)).every(Boolean),
                finalCount:text.split('FINAL CACHED RESULT').length-1,
                headerCount:text.split('OVERFLOW HEADER').length-1,
                footerCount:text.split('OVERFLOW FOOTER').length-1
              };
            } finally { await parser.destroy(); }
            process.stdout.write(JSON.stringify(metadata));
          })().catch(()=>{process.exitCode=1;});});`;
        // PDF.js y canvas se cierran en un proceso propio, sin terminar un hilo con trabajo nativo pendiente.
        const child = execFile(
          process.execPath,
          ['-e', source],
          { timeout: 30000, maxBuffer: 1048576 },
          (error, stdout) => {
            if (error) return reject(error);
            try {
              resolve(JSON.parse(stdout));
            } catch (error) {
              reject(error);
            }
          },
        );
        child.stdin.end(pdf);
      });
      expect(result.pages).toBeGreaterThan(1);
      expect(result.pages).toBeLessThanOrEqual(100);
      expect(result.complete).toBe(true);
      expect(result.tableComplete).toBe(true);
      expect(result.finalCount).toBe(1);
      expect(result.headerCount).toBe(1);
      expect(result.footerCount).toBe(1);
    }, 120000);
    it('rejects enormous DOCX overflow using the aggregate physical-page budget', async () => {
      const zip = new PizZip();
      zip.file(
        '_rels/.rels',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      );
      zip.file(
        '[Content_Types].xml',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      );
      const paragraphs =
        `<w:p><w:r><w:t>${'Bounded synthetic overflow '.repeat(20)}</w:t></w:r></w:p>`.repeat(
          2000,
        );
      zip.file(
        'word/document.xml',
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
      );
      let printed = false;
      const originalLaunch = puppeteer.launch.bind(puppeteer);
      const launch = jest
        .spyOn(puppeteer, 'launch')
        .mockImplementation(async (options) => {
          const browser = await originalLaunch(options);
          const createContext = browser.createBrowserContext.bind(browser);
          browser.createBrowserContext = async () => {
            const context = await createContext();
            const newPage = context.newPage.bind(context);
            context.newPage = async () => {
              const page = await newPage();
              const pdf = page.pdf.bind(page);
              page.pdf = async (options) => {
                printed = true;
                return pdf(options);
              };
              return page;
            };
            return context;
          };
          return browser;
        });
      try {
        await expect(
          new DocxPreviewRendererService().render(
            zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
          ),
        ).rejects.toThrow('El DOCX supera el límite de páginas');
        expect(printed).toBe(false);
      } finally {
        launch.mockRestore();
      }
    }, 120000);
    it.each(['docx', 'xlsx'])(
      'renders actual %s content into PDF and first-page JPEG',
      async (kind) => {
        const workspace = await mkdtemp(
          join(
            'C:\\Users\\diego\\AppData\\Local\\Temp\\opencode',
            'office-smoke-',
          ),
        );
        const marker =
          kind === 'docx' ? 'SYNTHETIC DOCX CONTENT' : 'SYNTHETIC XLSX CONTENT';
        let bytes: Buffer;
        if (kind === 'docx') {
          const zip = new PizZip();
          zip.file(
            '[Content_Types].xml',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
          );
          zip.file(
            '_rels/.rels',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
          );
          zip.file(
            'word/_rels/document.xml.rels',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="header" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="footer" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="image" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image.png"/></Relationships>',
          );
          zip.file(
            'word/header1.xml',
            '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>SYNTHETIC HEADER</w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>',
          );
          zip.file(
            'word/footer1.xml',
            '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>SYNTHETIC FOOTER</w:t></w:r></w:p></w:ftr>',
          );
          zip.file(
            'word/media/image.png',
            await sharp({
              create: {
                width: 120,
                height: 80,
                channels: 3,
                background: '#00cc00',
              },
            })
              .png()
              .toBuffer(),
          );
          const image =
            '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="1143000" cy="762000"/><wp:docPr id="1" name="Synthetic raster"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1143000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
          zip.file(
            'word/document.xml',
            `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:r><w:rPr><w:b/><w:color w:val="CC0000"/><w:sz w:val="40"/></w:rPr><w:t>${marker}</w:t></w:r></w:p>${image}<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>FINAL CONTENT MARKER</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="header"/><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
          );
          bytes = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        } else {
          const workbook = new ExcelJS.Workbook();
          const sheet = workbook.addWorksheet('Visible data');
          sheet.getCell('A1').value = marker;
          sheet.mergeCells('A1:C1');
          sheet.getCell('A1').font = {
            bold: true,
            size: 16,
            color: { argb: 'FFCC0000' },
          };
          sheet.getCell('A1').fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' },
          };
          sheet.getCell('A1').border = {
            bottom: { style: 'thick', color: { argb: 'FF0000FF' } },
          };
          sheet.getCell('A1').alignment = {
            horizontal: 'center',
            vertical: 'middle',
          };
          sheet.getRow(1).height = 36;
          sheet.getColumn(1).width = 24;
          for (let row = 2; row < 150; row++)
            sheet.getCell(row, 1).value = `Content row ${row}`;
          sheet.getCell('A150').value = 'FINAL CONTENT MARKER';
          sheet.getCell('B2').value = 0.125;
          sheet.getCell('B2').numFmt = '0.00%';
          sheet.getCell('C2').value = 1234.5;
          sheet.getCell('C2').numFmt = '$#,##0.00';
          bytes = Buffer.from(await workbook.xlsx.writeBuffer());
        }
        const path = join(workspace, `synthetic.${kind}`);
        await writeFile(path, bytes);
        const renderer = new DocumentGeneratorService();
        const office = new OfficeContentService(
          renderer,
          new DocxPreviewRendererService(),
        );
        const mime = kind === 'docx' ? DOCX_MIME : XLSX_MIME;
        const pdf = await office.convert(path, mime);
        await writeFile(join(workspace, 'preview.pdf'), pdf);
        // PDF.js usa imports dinámicos; se prueba fuera del contexto VM de Jest.
        const result = await new Promise<{
          text: string;
          output: string;
          yellowPixels: number;
          pages: number;
          redPixels: number;
          greenPixels: number;
          bold: boolean;
        }>((resolve, reject) => {
          const source = `
        require('ts-node/register/transpile-only');
        process.once('message', workerData => {
        workerData.pdf = Buffer.from(workerData.pdf, 'base64');
        (async () => {
          const {PDFParse} = require('pdf-parse');
          const parser = new PDFParse({data:new Uint8Array(workerData.pdf)});
            let text, yellowPixels = 0, redPixels = 0, greenPixels = 0, bold = false, pages;
           try {
             const extracted = await parser.getText();
             text = extracted.text;
             pages = extracted.total;
              {
                const screenshots = await parser.getScreenshot({first:1, scale:1});
               const {data,info} = await require('sharp')(screenshots.pages[0].data).removeAlpha().raw().toBuffer({resolveWithObject:true});
                for (let i=0;i<data.length;i+=info.channels) if(data[i]>220 && data[i+1]>220 && data[i+2]<80) yellowPixels++;
                for (let i=0;i<data.length;i+=info.channels) {
                  if(data[i]>120 && data[i+1]<80 && data[i+2]<80) redPixels++;
                  if(data[i]<80 && data[i+1]>120 && data[i+2]<80) greenPixels++;
                }
                if (!workerData.mime.includes('spreadsheetml')) {
                const pdfjsPath = require.resolve('pdfjs-dist/legacy/build/pdf.mjs', {paths:[require('node:path').dirname(require.resolve('pdf-parse'))]});
                const pdfjs = await import(require('node:url').pathToFileURL(pdfjsPath).href);
                const doc = await pdfjs.getDocument({data:new Uint8Array(workerData.pdf),useSystemFonts:true}).promise;
                try {
                  const page = await doc.getPage(1);
                  const content = await page.getTextContent();
                  await page.getOperatorList();
                  bold = Object.values(content.styles).some(style => /bold/i.test(style.fontFamily)) || content.items.some(item => /bold/i.test(page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName).name : ''));
                } finally {await doc.destroy();}
                }
             }
           } finally { await parser.destroy(); }
          const {DocumentGeneratorService} = require(process.cwd()+'/src/document-template/document-generator.service.ts');
          const {OfficeContentService} = require(process.cwd()+'/src/document/office-content/office-content.service.ts');
          const {ThumbnailService} = require(process.cwd()+'/src/document/thumbnail.service.ts');
          const renderer = new DocumentGeneratorService();
           const {DocxPreviewRendererService} = require(process.cwd()+'/src/document/office-content/docx-preview-renderer.service.ts');
           const thumbnail = new ThumbnailService(renderer,new OfficeContentService(renderer,new DocxPreviewRendererService()));
          thumbnail.thumbnailPath = workerData.workspace;
          thumbnail.generateIconThumbnail = async () => {throw new Error('Icon fallback forbidden in smoke');};
          const output = await thumbnail.generateThumbnail(workerData.path,9001,workerData.mime);
          if (!output) throw new Error('Content thumbnail failed');
            process.send({text,output,yellowPixels,redPixels,greenPixels,bold,pages}, () => process.disconnect());
        })().catch(error => { throw error; });
        });
      `;
          // La extracción/rasterización nativa termina en un proceso propio, no mediante Worker.terminate().
          const child = spawn(process.execPath, ['-e', source], {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          });
          const timer = setTimeout(() => {
            child.kill();
          }, 120000);
          let metadata: any;
          child.once('message', (value) => {
            metadata = value;
          });
          child.once('exit', (code) => {
            clearTimeout(timer);
            if (code === 0 && metadata) resolve(metadata);
            else
              reject(
                new Error(
                  `Synthetic Office inspection exited with code ${code}`,
                ),
              );
          });
          child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.send({ pdf: pdf.toString('base64'), path, mime, workspace });
        });
        expect(result.text).toContain(marker);
        expect(result.text).toContain('FINAL CONTENT MARKER');
        if (kind === 'xlsx') {
          expect(result.pages).toBe(5);
          expect(result.text).toContain('12.50%');
          expect(result.text).toContain('$1,234.50');
          expect(result.yellowPixels).toBeGreaterThan(1000);
        }
        if (kind === 'docx') {
          expect(result.pages).toBe(2);
          expect(result.text).toContain('SYNTHETIC HEADER');
          expect(result.text).toContain('SYNTHETIC FOOTER');
          expect(result.redPixels).toBeGreaterThan(100);
          expect(result.greenPixels).toBeGreaterThan(1000);
          expect(result.bold).toBe(true);
        }
        const metadata = await sharp(result.output).metadata();
        expect(metadata.format).toBe('jpeg');
        expect(metadata.width).toBe(200);
        expect(metadata.height).toBe(200);
        if (kind === 'docx') {
          const { data, info } = await sharp(result.output)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          let greenPixels = 0;
          for (let i = 0; i < data.length; i += info.channels)
            if (data[i] < 100 && data[i + 1] > 100 && data[i + 2] < 100)
              greenPixels++;
          expect(greenPixels).toBeGreaterThan(10);
        }
        if (kind === 'xlsx') {
          const { data, info } = await sharp(result.output)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          let yellowPixels = 0;
          for (let i = 0; i < data.length; i += info.channels)
            if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] < 120)
              yellowPixels++;
          expect(yellowPixels).toBeGreaterThan(10);
        }
        console.log(
          `Synthetic ${kind}: PDF ${pdf.length} bytes contains ${marker}; pages ${result.pages}; yellow pixels ${result.yellowPixels}; red ${result.redPixels}; green ${result.greenPixels}; bold ${result.bold}; JPEG ${metadata.width}x${metadata.height}; artifacts ${workspace}`,
        );
      },
      360000,
    );
  },
);
