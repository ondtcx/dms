import PizZip from 'pizzip';
import sharp from 'sharp';
import { validateDocxPackage } from './office-package-policy';
import { EventEmitter } from 'node:events';

export function docxPackage(
  extra: Record<string, string | Buffer> = {},
): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Safe text</w:t></w:r></w:p></w:body></w:document>',
  );
  for (const [name, data] of Object.entries(extra)) zip.file(name, data);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('DOCX package policy', () => {
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  it('allows bounded VML layout, GUID metadata and metadata separators in their exact contexts', async () => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/document.xml': `<w:document xmlns:w="${word}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><v:shape style="width:150pt;height:100pt;mso-wrap-distance-left:9pt;z-index:1"/><w:guid w:val="{01234567-1234-1234-1234-012345678901}"/><w:name w:val="Heading;Example"/><w:listSeparator w:val=";"/><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"/></w:body></w:document>`,
        }),
      ),
    ).resolves.toBeUndefined();
  });
  it.each([
    'width:1pt;height:1pt;background:url(https://invalid.example)',
    'width:1pt;height:expression(1)',
    'width:1pt;width:2pt',
    'width:999in;height:1pt',
    'width:1pt;height:1pt;@import:evil',
    'width:1pt;height:1pt;unknown:1',
  ])('rejects unsafe VML primitive styles %s', async (style) => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/document.xml': `<w:document xmlns:w="${word}" xmlns:v="urn:schemas-microsoft-com:vml"><w:body><v:shape style="${style}"/></w:body></w:document>`,
        }),
      ),
    ).rejects.toThrow();
  });
  it('does not grant metadata exceptions to foreign expanded identities', async () => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/document.xml': `<w:document xmlns:w="${word}" xmlns:x="urn:foreign"><w:body><w:guid x:val="{01234567-1234-1234-1234-012345678901}"/></w:body></w:document>`,
        }),
      ),
    ).rejects.toThrow();
  });
  it.each([
    'w:instr="DDEAUTO command" x:instr="PAGE"',
    'x:instr="PAGE" w:instr="DDEAUTO command"',
    'x:instr="DDEAUTO command"',
  ])('rejects namespace-shadowed active fields: %s', async (attrs) => {
    const namespace = attrs === 'x:instr="DDEAUTO command"' ? word : 'urn:x';
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/document.xml': `<w:document xmlns:w="${word}" xmlns:x="${namespace}"><w:body><w:fldSimple ${attrs}/></w:body></w:document>`,
        }),
      ),
    ).rejects.toThrow();
  });
  it.each([
    '<w:document><w:body/></w:document>',
    '<document w:instr="PAGE"/>',
    '<document>\u0001</document>',
    '<document>&#1;</document>',
    '<document>&#xB;</document>',
    '<document xmlns:xml="urn:wrong"/>',
    '<document xmlns:x="http://www.w3.org/XML/1998/namespace"/>',
    '<document xmlns:xmlns="urn:x"/>',
    '<document xmlns:x=""/>',
    `<w:document xmlns:w="${word}" xmlns:x="${word}"><w:fldSimple w:instr="PAGE" x:instr="PAGE"/></w:document>`,
    `<w:document xmlns:w="${word}"><w:fldSimple xmlns:w="urn:x" w:instr="PAGE"/></w:document>`,
  ])('rejects malformed or rebound XML: %s', async (xml) => {
    await expect(
      validateDocxPackage(docxPackage({ 'word/document.xml': xml })),
    ).rejects.toThrow();
  });
  it('accepts Word aliases, scoped bindings and legal character references', async () => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/document.xml': `<a:document xmlns:a="${word}"><a:body xmlns:b="${word}"><a:fldSimple b:instr="PAGE"/><a:p xml:space="preserve">&#9;&#10;&#13;&#x1F600;</a:p></a:body></a:document>`,
        }),
      ),
    ).resolves.toBeUndefined();
  });
  it('rejects relationship and content-type attribute shadows', async () => {
    for (const attributes of [
      'TargetMode="External" x:TargetMode="Internal"',
      'x:TargetMode="Internal" TargetMode="External"',
    ]) {
      await expect(
        validateDocxPackage(
          docxPackage({
            'word/_rels/document.xml.rels': `<r:Relationships xmlns:r="http://schemas.openxmlformats.org/package/2006/relationships" xmlns:x="urn:x"><r:Relationship Target="media/image.png" Type="image" ${attributes}/></r:Relationships>`,
          }),
        ),
      ).rejects.toThrow('Relación');
    }
    await expect(
      validateDocxPackage(
        docxPackage({
          '[Content_Types].xml':
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" xmlns:x="urn:x"><Default ContentType="application/javascript" x:ContentType="application/xml"/></Types>',
        }),
      ),
    ).rejects.toThrow('Tipo');
  });
  it('terminates stalled package validation after fifteen seconds', async () => {
    jest.useFakeTimers();
    const worker = Object.assign(new EventEmitter(), {
      terminate: jest.fn().mockResolvedValue(1),
    });
    const create = jest
      .spyOn(require('node:worker_threads'), 'Worker')
      .mockImplementation(() => worker);
    try {
      const outcome = expect(
        validateDocxPackage(docxPackage()),
      ).rejects.toThrow('15 segundos');
      await jest.advanceTimersByTimeAsync(15000);
      await outcome;
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(worker.listenerCount('message')).toBe(0);
    } finally {
      create.mockRestore();
      jest.useRealTimers();
    }
  });
  it('accepts Word page fields with inert formatting switches', async () => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/header1.xml': `<w:hdr xmlns:w="${word}"><w:fldSimple w:instr=" PAGE \\* MERGEFORMAT "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:hdr>`,
          'word/footer1.xml': `<w:ftr xmlns:w="${word}"><w:r><w:instrText xml:space="preserve"> NUMPAGES \\* Arabic </w:instrText></w:r></w:ftr>`,
        }),
      ),
    ).resolves.toBeUndefined();
  });
  it('accepts inert page-number fields in headers and footers', async () => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/header1.xml': `<w:hdr xmlns:w="${word}"><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>`,
          'word/footer1.xml': `<w:ftr xmlns:w="${word}"><w:p><w:r><w:instrText> NUMPAGES </w:instrText></w:r><w:r><w:t>2</w:t></w:r></w:p></w:ftr>`,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    'INCLUDETEXT "https://bad"',
    'DDEAUTO command',
    'HYPERLINK "file:///private"',
  ])('rejects active field %s', async (instruction) => {
    await expect(
      validateDocxPackage(
        docxPackage({
          'word/header1.xml': `<w:hdr xmlns:w="urn:w"><w:fldSimple w:instr='${instruction}'/></w:hdr>`,
        }),
      ),
    ).rejects.toThrow();
  });
  it('accepts a bounded local document and embedded raster', async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#00cc00' },
    })
      .png()
      .toBuffer();
    await expect(
      validateDocxPackage(docxPackage({ 'word/media/image.png': image })),
    ).resolves.toBeUndefined();
  });

  it('accepts font metadata without loading embedded fonts', async () => {
    await expect(
      validateDocxPackage(
        docxPackage({
          '[Content_Types].xml':
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>',
          'word/fontTable.xml':
            '<w:fonts xmlns:w="urn:w"><w:font w:name="Calibri"><w:family w:val="swiss"/></w:font></w:fonts>',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      'word/_rels/document.xml.rels',
      '<Relationships><Relationship TargetMode="Ext&#101;rnal" Target="https://bad" Type="hyperlink"/></Relationships>',
    ],
    [
      'word/document.xml',
      '<w:document xmlns:w="urn:w"><w:altChunk/></w:document>',
    ],
    [
      'word/document.xml',
      '<w:document xmlns:w="urn:w"><script>bad()</script></w:document>',
    ],
    ['word/media/image.svg', '<svg/>'],
    ['word/fonts/font.odttf', 'font'],
    ['word/afchunk.html', '<script>bad()</script>'],
    [
      'word/styles.xml',
      '<w:styles xmlns:w="urn:w"><w:rFonts w:ascii="Arial; color:red"/></w:styles>',
    ],
    ['word/styles.xml', '<!DOCTYPE x [<!ENTITY e "bad">]><x/>'],
    [
      'word/_rels/document.xml.rels',
      '<Relationships><Relationship Target="file:///private" Type="image"/></Relationships>',
    ],
    [
      'word/_rels/document.xml.rels',
      '<Relationships><Relationship Target="../outside.png" Type="image"/></Relationships>',
    ],
    ['word/document.xml', '<w:document xmlns:w="urn:w"><w:p></w:document>'],
    [
      'word/footer1.xml',
      '<w:ftr xmlns:w="urn:w"><w:r><w:instrText>INCLUDETEXT https://bad</w:instrText></w:r></w:ftr>',
    ],
    ['word/fonts.xml', '<w:fonts xmlns:w="urn:w"><w:embeddedFont/></w:fonts>'],
    [
      '[Content_Types].xml',
      '<Types><Default Extension="ttf" ContentType="application/x-font-ttf"/></Types>',
    ],
  ])('rejects hostile package part %s', async (name, xml) => {
    await expect(
      validateDocxPackage(docxPackage({ [name]: xml })),
    ).rejects.toThrow();
  });

  it('rejects corrupt packages and raster limits', async () => {
    await expect(
      validateDocxPackage(Buffer.from('not a zip')),
    ).rejects.toThrow();
    await expect(
      validateDocxPackage(
        docxPackage({ 'word/media/image.png': Buffer.alloc(1048577) }),
      ),
    ).rejects.toThrow('Imagen');
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    );
    await expect(
      validateDocxPackage(docxPackage({ 'word/media/image.png': svg })),
    ).rejects.toThrow('Imagen');
  });
});
