import JSZip from 'jszip';
import { normalizeDocxPackage } from './docx-package-normalizer';
import sharp from 'sharp';
import { EventEmitter } from 'node:events';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
async function fixture(body: string) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('DOCX compatibility normalization', () => {
  it('terminates stalled normalization after fifteen seconds with bounded worker heaps', async () => {
    const bytes = await fixture('<w:p/>');
    jest.useFakeTimers();
    const worker = Object.assign(new EventEmitter(), {
      terminate: jest.fn().mockResolvedValue(1),
    });
    const create = jest
      .spyOn(require('node:worker_threads'), 'Worker')
      .mockImplementation(() => worker);
    try {
      const outcome = expect(normalizeDocxPackage(bytes)).rejects.toThrow(
        '15 segundos',
      );
      expect(create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          resourceLimits: {
            maxOldGenerationSizeMb: 128,
            maxYoungGenerationSizeMb: 32,
          },
        }),
      );
      await jest.advanceTimersByTimeAsync(15000);
      await outcome;
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(worker.listenerCount('message')).toBe(0);
    } finally {
      create.mockRestore();
      jest.useRealTimers();
    }
  });
  it('removes external hyperlink relationships and wrappers without losing text', async () => {
    const zip = await JSZip.loadAsync(
      await fixture(
        `<w:p><w:hyperlink xmlns:r="${R}" r:id="link"><w:r><w:t>Visible link text</w:t></w:r></w:hyperlink></w:p>`,
      ),
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<Relationships xmlns="${P}"><Relationship Id="link" Type="${R}/hyperlink" Target="https://invalid.example" TargetMode="External"/></Relationships>`,
    );
    const out = await JSZip.loadAsync(
      await normalizeDocxPackage(
        await zip.generateAsync({ type: 'nodebuffer' }),
      ),
    );
    expect(await out.file('word/document.xml').async('string')).toContain(
      'Visible link text',
    );
    expect(await out.file('word/document.xml').async('string')).not.toContain(
      'hyperlink',
    );
    expect(
      await out.file('word/_rels/document.xml.rels').async('string'),
    ).not.toContain('invalid.example');
  });
  it('replaces HD Photo layers with trusted PNG notices and keeps drawing geometry', async () => {
    const zip = await JSZip.loadAsync(
      await fixture(
        `<w:p><w:r><w:drawing xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:r="${R}"><a:xfrm><a:ext cx="100" cy="200"/></a:xfrm><a:blip r:embed="base"><a:extLst><a:ext uri="{01234567-1234-1234-1234-012345678901}"><a14:imgLayer r:embed="wdp"/></a:ext></a:extLst></a:blip></w:drawing></w:r></w:p>`,
      ),
    );
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="wdp" ContentType="image/vnd.ms-photo"/></Types>',
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<Relationships xmlns="${P}"><Relationship Id="wdp" Type="http://schemas.microsoft.com/office/2007/relationships/hdphoto" Target="media/image.wdp"/></Relationships>`,
    );
    zip.file(
      'word/media/image.wdp',
      Buffer.from('unsupported synthetic image payload'),
    );
    const input = await zip.generateAsync({ type: 'nodebuffer' });
    const before = Buffer.from(input);
    const out = await JSZip.loadAsync(await normalizeDocxPackage(input));
    expect(input.equals(before)).toBe(true);
    expect(out.file('word/media/image.wdp')).toBeNull();
    const png = await out.file('word/media/image.wdp.png').async('nodebuffer');
    expect(await sharp(png).metadata()).toMatchObject({
      format: 'png',
      width: 480,
      height: 120,
    });
    expect(await out.file('word/document.xml').async('string')).toContain(
      '<a:blip r:embed="wdp">',
    );
    expect(await out.file('word/document.xml').async('string')).toContain(
      'cx="100" cy="200"',
    );
    expect(await out.file('[Content_Types].xml').async('string')).not.toContain(
      'ms-photo',
    );
  });
  it.each(['image', 'attachedTemplate', 'oleObject'])(
    'rejects external %s relationships',
    async (type) => {
      const zip = await JSZip.loadAsync(await fixture('<w:p/>'));
      zip.file(
        'word/_rels/document.xml.rels',
        `<Relationships xmlns="${P}"><Relationship Id="bad" Type="${R}/${type}" Target="https://invalid.example" TargetMode="External"/></Relationships>`,
      );
      await expect(
        normalizeDocxPackage(await zip.generateAsync({ type: 'nodebuffer' })),
      ).rejects.toThrow();
    },
  );
  it.each([
    '<w:p xmlns:x="urn:foreign" x:href="https://invalid.example"/>',
    '<w:p xmlns:x="urn:foreign"><x:instrText>PAGE</x:instrText></w:p>',
    '<w:p><w:r><w:instrText>PAGE</w:instrText></w:r></w:p>',
    '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>',
    '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
    '<w:p xmlns:x="urn:foreign" xmlns:y="urn:foreign" x:id="1" y:id="2"/>',
    '<w:p><w:t>&#1;</w:t></w:p>',
    '<w:p><w:t>&custom;</w:t></w:p>',
    '<w:p xmlns:xml="urn:foreign"/>',
    '<!DOCTYPE p [<!ENTITY custom "active">]><w:p/>',
    '<w:p xmlns:x="urn:foreign" x:style="width:1pt;url(https://invalid.example)"/>',
    '<w:p><w:fldSimple xmlns:x="urn:foreign" w:instr="DDEAUTO command" x:instr="PAGE"/></w:p>',
    '<w:p><w:fldSimple xmlns:x="urn:foreign" x:instr="PAGE" w:instr="DDEAUTO command"/></w:p>',
  ])('rejects malformed, active or namespace-confused XML', async (body) => {
    await expect(normalizeDocxPackage(await fixture(body))).rejects.toThrow();
  });
  it('preserves nested cached results and rejects split active instructions', async () => {
    const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
      separate = '<w:r><w:fldChar w:fldCharType="separate"/></w:r>',
      end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const valid = `${begin}<w:r><w:instrText>TOC \\h \\z \\c "Table"</w:instrText></w:r>${separate}${begin}<w:r><w:instrText>PAGEREF mark \\h</w:instrText></w:r>${separate}<w:r><w:t>42</w:t></w:r>${end}${end}`;
    const out = await JSZip.loadAsync(
      await normalizeDocxPackage(await fixture(`<w:p>${valid}</w:p>`)),
    );
    expect(await out.file('word/document.xml').async('string')).toContain('42');
    await expect(
      normalizeDocxPackage(
        await fixture(
          `<w:p>${begin}<w:r><w:instrText>DDE</w:instrText></w:r><w:r><w:instrText>AUTO command</w:instrText></w:r>${separate}${end}</w:p>`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('rejects oversized citation payloads and invalid ZIP declarations before transformation', async () => {
    await expect(
      normalizeDocxPackage(
        await fixture(
          `<w:fldSimple w:instr="ADDIN ZOTERO_ITEM CSL_CITATION {&quot;citationID&quot;:&quot;${'x'.repeat(65536)}&quot;,&quot;citationItems&quot;:[]}"/>`,
        ),
      ),
    ).rejects.toThrow();
    const bytes = await fixture('<w:p/>');
    const bad = Buffer.from(bytes);
    const offset = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bad.writeUInt32LE(17 * 1024 * 1024, offset + 24);
    await expect(normalizeDocxPackage(bad)).rejects.toThrow();
  });
  it('validates omitted metadata and refuses active parts disguised as WDP', async () => {
    const zip = await JSZip.loadAsync(await fixture('<w:p/>'));
    zip.file(
      'customXml/item1.xml',
      '<data xmlns="01234567-1234-1234-1234-012345678901"><?mso-contentType?></data>',
    );
    const result = await JSZip.loadAsync(
      await normalizeDocxPackage(
        await zip.generateAsync({ type: 'nodebuffer' }),
      ),
    );
    expect(result.file('customXml/item1.xml')).toBeNull();
    expect(await result.file('word/document.xml').async('string')).toContain(
      'partes de metadatos',
    );
    zip.file('customXml/item1.xml', '<data><script/></data>');
    await expect(
      normalizeDocxPackage(await zip.generateAsync({ type: 'nodebuffer' })),
    ).rejects.toThrow();
    zip.remove('customXml/item1.xml');
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="wdp" ContentType="application/javascript"/></Types>',
    );
    await expect(
      normalizeDocxPackage(await zip.generateAsync({ type: 'nodebuffer' })),
    ).rejects.toThrow();
    zip.file(
      'word/media/unsafe.bin',
      Buffer.from('synthetic unsupported payload'),
    );
    await expect(
      normalizeDocxPackage(await zip.generateAsync({ type: 'nodebuffer' })),
    ).rejects.toThrow();
  });
  it.each([
    'SEQ Figure \\* ARABIC',
    'SEQ Table \\r 1 \\s 2',
    'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"synthetic","properties":{"plainCitation":"Cached"},"citationItems":[{"id":1,"itemData":{"URL":"https://invalid.example"}}]}',
  ])('keeps only cached display for %s', async (instruction) => {
    const escaped = instruction.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const output = await normalizeDocxPackage(
      await fixture(
        `<w:fldSimple w:instr="${escaped}"><w:r><w:t>Cached result</w:t></w:r></w:fldSimple>`,
      ),
    );
    const xml = await (await JSZip.loadAsync(output))
      .file('word/document.xml')
      .async('string');
    expect(xml).toContain('Cached result');
    expect(xml).not.toContain('fldSimple');
    expect(xml).not.toContain('invalid.example');
  });
  it.each([
    'SEQ Figure DDEAUTO command',
    'SEQ Figure \\p',
    'SEQ Figure \\f',
    'PAGE \\h',
    'PAGEREF bookmark \\r',
    'ADDIN OTHER {"a":1}',
    'ADDIN ZOTERO_ITEM CSL_CITATION not-json',
    'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"x"} DDEAUTO command',
    'ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"x","citationItems":[],"__proto__":{}}',
  ])('rejects unsupported cached field %s', async (instruction) => {
    const escaped = instruction.replace(/"/g, '&quot;');
    await expect(
      normalizeDocxPackage(
        await fixture(`<w:fldSimple w:instr="${escaped}"/>`),
      ),
    ).rejects.toThrow();
  });
  it('aggregates split SEQ and citation instructions independently in nested cached results', async () => {
    const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r>';
    const separate = '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
    const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const citation = JSON.stringify({
      citationID: 'synthetic',
      citationItems: [
        {
          itemData: {
            URL: 'https://invalid.example/?a=1&b=2',
            title: 'A "quoted" title',
          },
        },
      ],
    })
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
    const output = await normalizeDocxPackage(
      await fixture(
        `<w:p>${begin}<w:r><w:instrText>SEQ Fig</w:instrText></w:r><w:r><w:instrText>ure \\* ARABIC</w:instrText></w:r>${separate}<w:r><w:t>7</w:t></w:r>${begin}<w:r><w:instrText>ADDIN ZOTERO_</w:instrText></w:r><w:r><w:instrText>ITEM CSL_CITATION ${citation}</w:instrText></w:r>${separate}<w:r><w:t>Stored citation</w:t></w:r>${end}${end}</w:p>`,
      ),
    );
    const xml = await (await JSZip.loadAsync(output))
      .file('word/document.xml')
      .async('string');
    expect(xml).toContain('Stored citation');
    expect(xml).toContain('<w:t>7</w:t>');
    expect(xml).not.toMatch(/instrText|fldChar|ZOTERO|invalid.example/);
  });
  it.each([
    '<w:p xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w14:docId w14:val="1A2B3C4D"/></w:p>',
  ])(
    'retains bounded Word 2010 hexadecimal document identifiers',
    async (body) => {
      await expect(
        normalizeDocxPackage(await fixture(body)),
      ).resolves.toBeInstanceOf(Buffer);
    },
  );
  it.each([
    '<w:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:ext uri="not-a-guid"/></w:p>',
    '<w:p xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w14:docId w14:val="not-a-guid"/></w:p>',
  ])(
    'requires valid GUID values for explicitly recognized metadata',
    async (body) => {
      await expect(normalizeDocxPackage(await fixture(body))).rejects.toThrow();
    },
  );
  it('preserves cached text and aggregates split complex field instructions', async () => {
    const input = await fixture(
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:instrText>REF bookmark \\h</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Cached reference</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
    );
    const before = Buffer.from(input);
    const output = await normalizeDocxPackage(input);
    const xml = await (await JSZip.loadAsync(output))
      .file('word/document.xml')
      .async('string');
    expect(xml).toContain('Cached reference');
    expect(xml).not.toContain('instrText');
    expect(xml).not.toContain('fldChar');
    expect(input.equals(before)).toBe(true);
  });

  it.each([
    'DDEAUTO command',
    'INCLUDETEXT target',
    'INCLUDEPICTURE target',
    'PAGE DDEAUTO command',
  ])('rejects active instruction %s', async (instruction) => {
    await expect(
      normalizeDocxPackage(
        await fixture(
          `<w:fldSimple w:instr="${instruction}"><w:r><w:t>Cached</w:t></w:r></w:fldSimple>`,
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects namespace shadowing even when cached field text is present', async () => {
    await expect(
      normalizeDocxPackage(
        await fixture(
          '<w:fldSimple xmlns:x="urn:foreign" x:instr="PAGE" w:instr="DDEAUTO command"/>',
        ),
      ),
    ).rejects.toThrow();
  });
});
