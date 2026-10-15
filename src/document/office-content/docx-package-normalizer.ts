import { Worker } from 'node:worker_threads';
import { inspectDocxPackage, validateOfficeZip } from './office-package-policy';

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
const XML = 'http://www.w3.org/XML/1998/namespace';
let normalizationStage = 0;

function fail(): never {
  throw new Error('Normalización DOCX no compatible');
}

function parse(xml: string, inertMetadata = false) {
  const { DOMParser } = require('@xmldom/xmldom');
  if (inertMetadata) xml = xml.replace(/<\?mso-contentType\?>/g, '');
  if (
    /<!|<\?(?!xml\s)|encoding\s*=\s*['"](?!utf-8['"])/i.test(
      xml.replace(/<!--[^]*?-->/g, ''),
    )
  )
    fail();
  for (const c of xml) {
    const n = c.codePointAt(0);
    if (
      !(
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n <= 0xd7ff) ||
        (n >= 0xe000 && n <= 0xfffd) ||
        (n >= 0x10000 && n <= 0x10ffff)
      )
    )
      fail();
  }
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i.test(xml)) fail();
  for (const match of xml.matchAll(/&#(x[\da-f]+|\d+);/gi)) {
    const n =
      match[1][0].toLowerCase() === 'x'
        ? parseInt(match[1].slice(1), 16)
        : Number(match[1]);
    if (
      !(
        n === 9 ||
        n === 10 ||
        n === 13 ||
        (n >= 32 && n <= 0xd7ff) ||
        (n >= 0xe000 && n <= 0xfffd) ||
        (n >= 0x10000 && n <= 0x10ffff)
      )
    )
      fail();
  }
  const doc = new DOMParser({ onError: () => fail() }).parseFromString(
    xml,
    'application/xml',
  );
  let count = 0;
  function visit(element: Element, depth: number) {
    if (++count > 200000 || depth > 100) fail();
    if (element.prefix && !element.namespaceURI) fail();
    if (
      [
        'script',
        'svg',
        'object',
        'oleobject',
        'control',
        'altchunk',
        'attachedtemplate',
        'embeddedfont',
      ].includes(element.localName.toLowerCase())
    )
      fail();
    if (
      ['fldSimple', 'fldChar', 'instrText', 'hyperlink'].includes(
        element.localName,
      ) &&
      element.namespaceURI !== WORD
    )
      fail();
    if (element.localName === 'Relationship' && element.namespaceURI !== REL)
      fail();
    if (['Override', 'Default'].includes(element.localName)) {
      if (element.namespaceURI !== TYPES) fail();
      const type = element.getAttribute('ContentType') || '';
      if (
        /html|javascript|svg|macro|oleobject|vba/i.test(type) ||
        (/font/i.test(type) &&
          type !==
            'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml')
      )
        fail();
    }
    const attrs = new Set<string>();
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes.item(i);
      if (attr.prefix && !attr.namespaceURI) fail();
      const identity = `${attr.namespaceURI || ''}\0${attr.localName}`;
      if (attrs.has(identity)) fail();
      attrs.add(identity);
      if (/^on/i.test(attr.localName)) fail();
      if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') {
        if (attr.localName === 'xmlns' && attr.value === XML) fail();
        if (attr.localName === 'xml' ? attr.value !== XML : attr.value === XML)
          fail();
        if (
          attr.value === 'http://www.w3.org/2000/xmlns/' ||
          (attr.prefix === 'xmlns' && !attr.value)
        )
          fail();
      }
      if (
        ['instr', 'fldCharType'].includes(attr.localName) &&
        attr.namespaceURI !== WORD
      )
        fail();
      if (
        element.localName === 'Relationship' &&
        ['Id', 'Type', 'Target', 'TargetMode'].includes(attr.localName) &&
        attr.namespaceURI
      )
        fail();
    }
    for (let node = element.firstChild; node; node = node.nextSibling)
      if (node.nodeType === 1) visit(node as unknown as Element, depth + 1);
  }
  visit(doc.documentElement as unknown as Element, 0);
  return doc;
}

function cachedField(instruction: string) {
  if (instruction.length > 65536) fail();
  if (/^\s*ADDIN\b/i.test(instruction)) {
    const match =
      /^\s*ADDIN\s+ZOTERO_ITEM\s+CSL_CITATION\s+(\{[^]*\})\s*$/i.exec(
        instruction,
      );
    if (!match) fail();
    let payload: any;
    try {
      payload = JSON.parse(match[1]);
    } catch {
      fail();
    }
    let nodes = 0;
    const visit = (value: any, depth: number) => {
      if (++nodes > 10000 || depth > 32) fail();
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          if (['__proto__', 'constructor', 'prototype'].includes(key)) fail();
          visit(child, depth + 1);
        }
      }
    };
    visit(payload, 0);
    if (
      !payload ||
      Array.isArray(payload) ||
      typeof payload.citationID !== 'string' ||
      !Array.isArray(payload.citationItems) ||
      payload.citationItems.length > 1000
    )
      fail();
    return;
  }
  const tokens =
    instruction.trim().match(/"[^"\r\n]*"|\\[a-z*]|[^\s]+/gi) || [];
  const name = tokens.shift()?.toUpperCase();
  if (
    ![
      'PAGE',
      'NUMPAGES',
      'SECTIONPAGES',
      'TOC',
      'PAGEREF',
      'REF',
      'NOTEREF',
      'SEQ',
    ].includes(name)
  )
    fail();
  if (['PAGEREF', 'REF', 'NOTEREF', 'SEQ'].includes(name)) {
    if (!/^[A-Za-z_][\w.-]{0,255}$/.test(tokens.shift() || '')) fail();
  }
  while (tokens.length) {
    const token = tokens.shift();
    if (token === '\\*') {
      if (
        !/^(MERGEFORMAT|Arabic|ROMAN|ALPHABETIC)$/i.test(tokens.shift() || '')
      )
        fail();
    } else if (name === 'SEQ' && ['\\r', '\\s'].includes(token)) {
      if (!/^\d{1,9}$/.test(tokens.shift() || '')) fail();
    } else if (name === 'SEQ' && ['\\c', '\\h', '\\n'].includes(token)) {
      continue;
    } else if (name === 'SEQ') {
      fail();
    } else if (
      name === 'TOC' &&
      ['\\o', '\\t', '\\n', '\\p', '\\c'].includes(token)
    ) {
      const value = tokens.shift() || '';
      if (token === '\\o' || token === '\\n') {
        if (!/^"?[1-9]-[1-9]"?$/.test(value)) fail();
      } else if (!/^"[\p{L}\p{N} _,.-]{1,512}"$/u.test(value)) fail();
    } else if (
      !(
        {
          TOC: ['\\h', '\\z', '\\u', '\\w', '\\x'],
          PAGEREF: ['\\h', '\\p'],
          REF: ['\\h', '\\p', '\\r', '\\n', '\\f'],
          NOTEREF: ['\\h', '\\p', '\\f'],
        }[name] || []
      ).includes(token)
    )
      fail();
  }
}

function unwrap(element: any) {
  const parent = element.parentNode;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

// Solo se transforma una copia en memoria; los campos conservan el resultado almacenado.
async function normalizeUnchecked(bytes: Buffer): Promise<Buffer> {
  normalizationStage = 1;
  const JSZip = require('jszip');
  const sharp = require('sharp');
  const { XMLSerializer } = require('@xmldom/xmldom');
  const zip = await JSZip.loadAsync(bytes);
  const docs = new Map<string, ReturnType<typeof parse>>();
  for (const entry of Object.values(zip.files) as any[]) {
    if (entry.dir) continue;
    if (
      entry.unsafeOriginalName !== entry.name ||
      !/^[A-Za-z0-9_\-./\[\] ]+$/.test(entry.name) ||
      /(^|\/)\.\.?($|\/)/.test(entry.name) ||
      entry.name.startsWith('/')
    )
      fail();
    if (/\.(xml|rels)$/i.test(entry.name))
      docs.set(
        entry.name,
        parse(await entry.async('string'), /^customXml\//i.test(entry.name)),
      );
    else if (!/\.(png|jpe?g|gif|webp|wdp)$/i.test(entry.name)) fail();
  }
  const wdp = new Map<string, string>();
  normalizationStage = 2;
  const omitted = new Set(
    Array.from(docs.keys()).filter(
      (name) => /^customXml\//i.test(name) || /^word\/glossary\//i.test(name),
    ),
  );
  for (const entry of Object.values(zip.files) as any[]) {
    if (!entry.dir && /\.wdp$/i.test(entry.name)) {
      if (
        !/^word\/media\/[A-Za-z0-9_-]+\.wdp$/i.test(entry.name) ||
        (await entry.async('nodebuffer')).length > 1048576
      )
        fail();
      const replacement = entry.name + '.png';
      if (zip.file(replacement)) fail();
      wdp.set(entry.name, replacement);
    }
  }
  let replacements = 0;
  const wdpIds = new Map<string, Set<string>>();
  for (const [name, doc] of docs) {
    const elements = Array.from(doc.getElementsByTagName('*')) as any[];
    normalizationStage = 3;
    if (/\.rels$/i.test(name)) {
      const owner =
        name === '_rels/.rels' ? '' : name.replace(/_rels\/[^/]+\.rels$/, '');
      for (const element of elements) {
        if (element.localName !== 'Relationship') continue;
        if (element.namespaceURI !== REL) fail();
        const type = element.getAttribute('Type');
        const target = element.getAttribute('Target');
        if (element.getAttribute('TargetMode')?.toLowerCase() === 'external') {
          if (
            type !== OFFICE_REL + '/hyperlink' ||
            !/^https?:\/\/[^\s<>]+$/i.test(target || '')
          )
            fail();
          element.parentNode.removeChild(element);
        } else {
          if (!target || /[\\?#%]|^[a-z][a-z0-9+.-]*:|^\//i.test(target))
            fail();
          const resolved = require('node:path').posix.normalize(owner + target);
          if (omitted.has(resolved)) {
            const types = ['customXml', 'customXmlProps', 'glossaryDocument'];
            if (omitted.has(name))
              types.push(
                'webSettings',
                'settings',
                'styles',
                'fontTable',
                'endnotes',
                'footnotes',
              );
            if (!types.map((kind) => OFFICE_REL + '/' + kind).includes(type))
              fail();
            element.parentNode.removeChild(element);
            continue;
          }
          if (/(^|\/)\.\.?($|\/)/.test(target)) fail();
          const replacement = wdp.get(owner + target);
          if (replacement) {
            if (
              ![
                OFFICE_REL + '/image',
                'http://schemas.microsoft.com/office/2007/relationships/hdphoto',
              ].includes(type)
            )
              fail();
            element.setAttribute('Type', OFFICE_REL + '/image');
            element.setAttribute('Target', replacement.slice(owner.length));
            replacements++;
            if (!wdpIds.has(owner)) wdpIds.set(owner, new Set());
            wdpIds.get(owner).add(element.getAttribute('Id'));
          }
        }
      }
    }
    const fields: { instruction: string; separated: boolean }[] = [];
    normalizationStage = 4;
    for (const element of elements) {
      if (
        element.namespaceURI === 'urn:schemas-microsoft-com:vml' &&
        element.localName === 'shape' &&
        element.hasAttribute('style')
      ) {
        const declarations = element.getAttribute('style').split(';');
        element.setAttribute(
          'style',
          declarations
            .filter((declaration: string) => {
              if (!/^\s*o:/.test(declaration)) return true;
              if (
                !/^\s*o:(allowoverlap|allowincell):(true|false|t|f)\s*$/.test(
                  declaration,
                )
              )
                fail();
              return false;
            })
            .join(';'),
        );
      }
      if (element.namespaceURI !== WORD) continue;
      if (element.localName === 'fldChar') {
        normalizationStage = 5;
        const kind = element.getAttributeNS(WORD, 'fldCharType');
        if (kind === 'begin') {
          if (fields.length >= 32 || fields.some((f) => !f.separated)) fail();
          fields.push({ instruction: '', separated: false });
        } else if (kind === 'separate') {
          const field = fields[fields.length - 1];
          if (!field || field.separated) fail();
          cachedField(field.instruction);
          field.separated = true;
        } else if (kind === 'end') {
          const field = fields.pop();
          if (!field || !field.separated) fail();
        } else fail();
        element.parentNode.removeChild(element);
      } else if (element.localName === 'instrText') {
        normalizationStage = 6;
        const field = fields[fields.length - 1];
        if (!field || field.separated) fail();
        field.instruction += element.textContent;
        if (field.instruction.length > 65536) fail();
        element.parentNode.removeChild(element);
      } else if (element.localName === 'fldSimple') {
        normalizationStage = 7;
        cachedField(element.getAttributeNS(WORD, 'instr') || '');
        unwrap(element);
      } else if (element.localName === 'hyperlink') unwrap(element);
      else if (
        fields.some((f) => !f.separated) &&
        element.localName === 't' &&
        element.textContent.trim()
      )
        fail();
    }
    if (fields.length) fail();
    if (name === '[Content_Types].xml') {
      normalizationStage = 8;
      for (const element of elements) {
        if (element.namespaceURI !== TYPES) continue;
        if (
          element.localName === 'Default' &&
          element.getAttribute('Extension')?.toLowerCase() === 'wdp'
        ) {
          if (
            !['image/vnd.ms-photo', 'image/x-wdp'].includes(
              element.getAttribute('ContentType'),
            )
          )
            fail();
          element.parentNode.removeChild(element);
        }
        if (element.localName === 'Override') {
          if (omitted.has((element.getAttribute('PartName') || '').slice(1))) {
            element.parentNode.removeChild(element);
            continue;
          }
          const replacement = wdp.get(
            (element.getAttribute('PartName') || '').slice(1),
          );
          if (replacement) {
            if (
              !['image/vnd.ms-photo', 'image/x-wdp'].includes(
                element.getAttribute('ContentType'),
              )
            )
              fail();
            element.setAttribute('PartName', '/' + replacement);
            element.setAttribute('ContentType', 'image/png');
          }
        }
      }
      if (
        wdp.size &&
        !elements.some(
          (e) =>
            e.namespaceURI === TYPES &&
            e.localName === 'Default' &&
            e.getAttribute('Extension') === 'png',
        )
      ) {
        const node = doc.createElementNS(TYPES, 'Default');
        node.setAttribute('Extension', 'png');
        node.setAttribute('ContentType', 'image/png');
        doc.documentElement.appendChild(node);
      }
    }
  }
  for (const [name, doc] of docs) {
    for (const element of Array.from(
      doc.getElementsByTagNameNS(
        'http://schemas.microsoft.com/office/drawing/2010/main',
        'imgLayer',
      ),
    ) as any[]) {
      const id = element.getAttributeNS(OFFICE_REL, 'embed');
      if (!wdpIds.get(name.replace(/[^/]+$/, ''))?.has(id)) continue;
      let parent = element.parentNode;
      while (
        parent &&
        !(
          parent.namespaceURI ===
            'http://schemas.openxmlformats.org/drawingml/2006/main' &&
          parent.localName === 'blip'
        )
      )
        parent = parent.parentNode;
      if (!parent) fail();
      parent.setAttributeNS(OFFICE_REL, 'r:embed', id);
    }
  }
  if (wdp.size && !replacements) fail();
  normalizationStage = 9;
  if (omitted.size || wdp.size) {
    const doc = docs.get('word/document.xml');
    const body = doc?.getElementsByTagNameNS(WORD, 'body').item(0);
    if (!body) fail();
    const paragraph = doc.createElementNS(WORD, 'w:p');
    const run = doc.createElementNS(WORD, 'w:r');
    const text = doc.createElementNS(WORD, 'w:t');
    text.appendChild(
      doc.createTextNode(
        `Vista previa: ${wdp.size} imágenes WDP sustituidas por avisos; se omiten ${omitted.size} partes de metadatos y bloques auxiliares. Los enlaces y campos se muestran sin actividad.`,
      ),
    );
    run.appendChild(text);
    paragraph.appendChild(run);
    const section = Array.from(body.childNodes).find(
      (node: any) => node.namespaceURI === WORD && node.localName === 'sectPr',
    );
    body.insertBefore(paragraph, section || null);
  }
  if (wdp.size) {
    normalizationStage = 10;
    const notice = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120"><rect width="480" height="120" fill="#eeeeee"/><text x="20" y="65" font-size="22" fill="#333333">Imagen WDP no compatible</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    for (const [name, replacement] of wdp) {
      zip.remove(name);
      zip.file(replacement, notice);
    }
  }
  const serializer = new XMLSerializer();
  normalizationStage = 11;
  for (const [name, doc] of docs) {
    if (omitted.has(name)) zip.remove(name);
    else zip.file(name, serializer.serializeToString(doc));
  }
  const normalized = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  return normalized;
}

export async function normalizeDocxPackage(bytes: Buffer): Promise<Buffer> {
  validateOfficeZip(bytes);
  return new Promise((resolve, reject) => {
    const constants = `let normalizationStage=0;const WORD=${JSON.stringify(WORD)},REL=${JSON.stringify(REL)},OFFICE_REL=${JSON.stringify(OFFICE_REL)},TYPES=${JSON.stringify(TYPES)},XML=${JSON.stringify(XML)};`;
    const source = [fail, parse, cachedField, unwrap, normalizeUnchecked]
      .map((fn) => fn.toString())
      .join('\n');
    const worker = new Worker(
      `const {parentPort,workerData}=require('node:worker_threads');${constants}${source}\n(async()=>{await (${inspectDocxPackage.toString()})(Buffer.from(workerData),true);const bytes=await normalizeUnchecked(Buffer.from(workerData));normalizationStage=12;(${validateOfficeZip.toString()})(bytes);await (${inspectDocxPackage.toString()})(bytes);parentPort.postMessage({bytes});})().catch(error=>parentPort.postMessage({error:true,stage:normalizationStage,policyStyle:error.message==='Estilo o atributo DOCX no compatible',policyResource:error.message==='Recurso externo no compatible'}));`,
      {
        eval: true,
        workerData: bytes,
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 32,
        },
      },
    );
    let settled = false;
    const finish = (bytes?: Buffer, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker
        .terminate()
        .then(() => (error ? reject(error) : resolve(bytes)), reject);
    };
    const timer = setTimeout(
      () =>
        finish(
          undefined,
          new Error('La normalización DOCX superó el límite de 15 segundos'),
        ),
      15000,
    );
    worker.once('message', (result) => {
      if (!result.error) return finish(Buffer.from(result.bytes));
      const error = new Error(
        result.policyStyle
          ? 'Estilo o atributo DOCX no compatible'
          : result.policyResource
            ? 'Recurso externo no compatible'
            : 'Normalización DOCX no compatible',
      );
      (error as any).stage = result.stage;
      finish(undefined, error);
    });
    worker.once('error', () =>
      finish(undefined, new Error('Normalización DOCX no compatible')),
    );
    worker.once('exit', () =>
      finish(undefined, new Error('Normalización DOCX terminó sin resultado')),
    );
  });
}
