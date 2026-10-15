import { Worker } from 'node:worker_threads';

// Primero se comprueban todos los metadatos ZIP; después se infla con límites reales.
export function validateOfficeZip(bytes: Buffer): void {
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error('El archivo supera el límite de 10 MiB');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Archivo Office corrupto');
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (
    bytes.readUInt32LE(end + 4) !== 0 ||
    !count ||
    count > 2000 ||
    offset + size !== end
  )
    throw new Error('ZIP no compatible o demasiado grande');
  let total = 0;
  const entries: {
    start: number;
    compressed: number;
    expanded: number;
    method: number;
  }[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('ZIP corrupto');
    const expanded = bytes.readUInt32LE(offset + 24),
      compressed = bytes.readUInt32LE(offset + 20),
      method = bytes.readUInt16LE(offset + 10),
      local = bytes.readUInt32LE(offset + 42);
    total += expanded;
    if (
      bytes.readUInt16LE(offset + 8) & 1 ||
      expanded > 16 * 1024 * 1024 ||
      total > 40 * 1024 * 1024
    )
      throw new Error('El ZIP supera los límites de expansión');
    if (
      ![0, 8].includes(method) ||
      local + 30 > end ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error('Entrada ZIP no compatible');
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (start + compressed > bytes.readUInt32LE(end + 16))
      throw new Error('Entrada ZIP corrupta');
    entries.push({ start, compressed, expanded, method });
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
  if (offset !== end) throw new Error('ZIP corrupto');
  for (const entry of entries) {
    const compressed = bytes.subarray(
      entry.start,
      entry.start + entry.compressed,
    );
    const expanded =
      entry.method === 0
        ? compressed
        : require('node:zlib').inflateRawSync(compressed, {
            maxOutputLength: Math.max(1, entry.expanded),
          });
    if (expanded.length !== entry.expanded)
      throw new Error('Tamaño ZIP declarado incorrecto');
  }
}

// Política autocontenida: el hilo no depende de rutas a archivos TypeScript fuente.
export async function inspectDocxPackage(
  bytes: Buffer,
  syntaxOnly = false,
): Promise<void> {
  const zip = await require('jszip').loadAsync(bytes);
  if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml'))
    throw new Error('Paquete DOCX no válido');
  const wordNamespace =
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';
  const validCharacter = (n: number) =>
    n === 9 ||
    n === 10 ||
    n === 13 ||
    (n >= 0x20 && n <= 0xd7ff) ||
    (n >= 0xe000 && n <= 0xfffd) ||
    (n >= 0x10000 && n <= 0x10ffff);
  const decode = (text: string) => {
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(text))
      throw new Error('Entidad XML no compatible');
    return text.replace(
      /&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,
      (_, entity) => {
        const names = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
        if (entity in names) return names[entity];
        const number = entity.startsWith('#x')
          ? parseInt(entity.slice(2), 16)
          : Number(entity.slice(1));
        if (!validCharacter(number)) throw new Error('Entidad XML no válida');
        return String.fromCodePoint(number);
      },
    );
  };
  const inertPageField = (instruction: string) =>
    /^\s*(PAGE|NUMPAGES|SECTIONPAGES)(?:\s+\\\*\s+(MERGEFORMAT|Arabic|ROMAN|ALPHABETIC))*\s*$/i.test(
      instruction,
    );
  const checkXml = (xml: string, inertMetadata = false) => {
    for (const character of xml) {
      if (!validCharacter(character.codePointAt(0)))
        throw new Error('Carácter XML no válido');
    }
    // Se admite XML OOXML UTF-8, sin DTD, CDATA ni instrucciones de procesamiento adicionales.
    if (
      xml.includes('\0') ||
      /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml) ||
      /encoding\s*=\s*['"](?!utf-8['"])/i.test(xml)
    )
      throw new Error('XML no compatible');
    xml = xml
      .replace(/^\uFEFF?\s*<\?xml\s[^?]*\?>/i, '')
      .replace(/<!--[^]*?-->/g, '');
    const stack: {
      name: string;
      uri: string;
      local: string;
      namespaces: Map<string, string>;
    }[] = [];
    let cursor = 0,
      roots = 0,
      elements = 0;
    const tagPattern = /<([^<>]*)>/g;
    let match: RegExpExecArray;
    while ((match = tagPattern.exec(xml))) {
      const text = xml.slice(cursor, match.index);
      if (
        text.includes('<') ||
        text.includes('>') ||
        (!stack.length && text.trim())
      )
        throw new Error('XML corrupto');
      const decodedText = decode(text);
      if (
        stack[stack.length - 1]?.uri === wordNamespace &&
        stack[stack.length - 1]?.local === 'instrText' &&
        !syntaxOnly &&
        !inertPageField(decodedText)
      )
        throw new Error('Campo DOCX no compatible');
      cursor = tagPattern.lastIndex;
      let tag = match[1];
      if (tag.startsWith('/')) {
        if (
          !/^\/[\w.:-]+\s*$/.test(tag) ||
          stack.pop()?.name !== tag.slice(1).trim()
        )
          throw new Error('XML corrupto');
        continue;
      }
      const nameMatch = /^([A-Za-z_][\w.:-]*)([\s\S]*)$/.exec(tag);
      if (!nameMatch) throw new Error('XML corrupto');
      const name = nameMatch[1],
        local = name.split(':').pop().toLowerCase();
      if (++elements > 200000 || stack.length > 100)
        throw new Error('XML supera el límite');
      if (!stack.length && ++roots > 1) throw new Error('XML corrupto');
      if (
        [
          'altchunk',
          'script',
          'svg',
          'object',
          'oleobject',
          'control',
          'attachedtemplate',
          'embeddedfont',
        ].includes(local)
      )
        throw new Error('Contenido DOCX no compatible');
      let rest = nameMatch[2];
      const empty = /\/\s*$/.test(rest);
      if (empty) rest = rest.replace(/\/\s*$/, '');
      const rawAttrs = new Map<string, string>();
      while (rest.trim()) {
        const attr =
          /^\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
        if (!attr) throw new Error('Atributo XML corrupto');
        const key = attr[1].split(':').pop().toLowerCase();
        if (rawAttrs.has(attr[1])) throw new Error('Atributo XML duplicado');
        const value = decode(attr[2] ?? attr[3]);
        rawAttrs.set(attr[1], value);
        if (/^xmlns(?::|$)/.test(attr[1])) {
          if (
            value !== '' &&
            !(
              syntaxOnly &&
              inertMetadata &&
              /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
                value,
              )
            ) &&
            !/^https?:\/\/[a-zA-Z0-9./_-]+$/.test(value) &&
            !/^urn:[a-zA-Z0-9:._-]+$/.test(value)
          )
            throw new Error('Espacio XML no compatible');
        }
        rest = rest.slice(attr[0].length);
      }
      const namespaces = new Map(
        stack[stack.length - 1]?.namespaces ?? [['xml', xmlNamespace]],
      );
      for (const [key, value] of rawAttrs) {
        if (key !== 'xmlns' && !key.startsWith('xmlns:')) continue;
        const prefix = key === 'xmlns' ? '' : key.slice(6);
        if (
          (prefix && !/^[A-Za-z_][\w.-]*$/.test(prefix)) ||
          prefix === 'xmlns' ||
          (prefix === 'xml' && value !== xmlNamespace) ||
          (prefix !== 'xml' && value === xmlNamespace) ||
          value === 'http://www.w3.org/2000/xmlns/' ||
          (prefix && !value)
        )
          throw new Error('Espacio XML reservado no válido');
        namespaces.set(prefix, value);
      }
      const expand = (qualified: string, attribute: boolean) => {
        if (!/^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/.test(qualified))
          throw new Error('Nombre XML no válido');
        const parts = qualified.split(':');
        const prefix = parts.length === 2 ? parts[0] : '';
        if (prefix === 'xmlns' || (prefix && !namespaces.get(prefix)))
          throw new Error('Prefijo XML no declarado');
        return {
          uri: !prefix && attribute ? '' : namespaces.get(prefix) || '',
          local: parts[parts.length - 1],
        };
      };
      const element = expand(name, false);
      if (local === 'instrtext' && element.uri !== wordNamespace)
        throw new Error('Campo DOCX no compatible');
      const attrs = new Map<string, string>();
      for (const [key, value] of rawAttrs) {
        if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
        const expanded = expand(key, true);
        const identity = JSON.stringify([expanded.uri, expanded.local]);
        if (attrs.has(identity)) throw new Error('Atributo XML duplicado');
        attrs.set(identity, value);
        if (syntaxOnly) continue;
        const keyLocal = expanded.local.toLowerCase();
        const vmlStyle =
          element.uri === 'urn:schemas-microsoft-com:vml' &&
          ['shape', 'shapetype', 'group', 'rect', 'oval'].includes(local) &&
          !expanded.uri &&
          keyLocal === 'style';
        if (vmlStyle) {
          const seen = new Set<string>();
          for (const declaration of value.split(';').filter((s) => s.trim())) {
            const parts = /^\s*([a-z-]+)\s*:\s*([^:;]+)\s*$/i.exec(declaration);
            if (!parts || seen.has(parts[1].toLowerCase()))
              throw new Error('Estilo VML no compatible');
            const property = parts[1].toLowerCase(),
              primitive = parts[2].trim();
            seen.add(property);
            if (
              [
                'width',
                'height',
                'margin-left',
                'margin-top',
                'left',
                'top',
                'mso-wrap-distance-left',
                'mso-wrap-distance-right',
                'mso-wrap-distance-top',
                'mso-wrap-distance-bottom',
              ].includes(property)
            ) {
              const number = /^(-?\d+(?:\.\d+)?)(pt|px|in|cm|mm)?$/.exec(
                primitive,
              );
              const scale = {
                pt: 96 / 72,
                px: 1,
                in: 96,
                cm: 96 / 2.54,
                mm: 96 / 25.4,
              };
              if (
                !number ||
                Math.abs(Number(number[1])) * (scale[number[2]] || 1) > 2000 ||
                (['width', 'height'].includes(property) &&
                  Number(number[1]) <= 0)
              )
                throw new Error('Dimensión VML no compatible');
            } else if (property === 'z-index') {
              if (
                !/^-?\d{1,10}$/.test(primitive) ||
                Math.abs(Number(primitive)) > 2147483647
              )
                throw new Error('Capa VML no compatible');
            } else if (property === 'position') {
              if (!['absolute', 'relative', 'static'].includes(primitive))
                throw new Error('Posición VML no compatible');
            } else if (property === 'visibility') {
              if (!['visible', 'hidden'].includes(primitive))
                throw new Error('Visibilidad VML no compatible');
            } else if (
              [
                'mso-position-horizontal-relative',
                'mso-position-vertical-relative',
              ].includes(property)
            ) {
              if (
                !['page', 'margin', 'text', 'char', 'line'].includes(primitive)
              )
                throw new Error('Referencia VML no compatible');
            } else if (
              ['mso-position-horizontal', 'mso-position-vertical'].includes(
                property,
              )
            ) {
              if (
                ![
                  'absolute',
                  'left',
                  'right',
                  'center',
                  'top',
                  'bottom',
                  'inside',
                  'outside',
                ].includes(primitive)
              )
                throw new Error('Alineación VML no compatible');
            } else throw new Error('Propiedad VML no compatible');
          }
          if (!seen.size || seen.size > 16)
            throw new Error('Estilo VML no compatible');
          continue;
        }
        const guid =
          /^\{[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\}$/i.test(
            value,
          );
        const guidMetadata =
          (element.uri ===
            'http://schemas.openxmlformats.org/drawingml/2006/main' &&
            local === 'ext' &&
            !expanded.uri &&
            keyLocal === 'uri') ||
          (element.uri ===
            'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties' &&
            local === 'property' &&
            !expanded.uri &&
            keyLocal === 'fmtid') ||
          (element.uri ===
            'http://schemas.openxmlformats.org/officeDocument/2006/customXml' &&
            local === 'datastoreitem' &&
            expanded.uri === element.uri &&
            keyLocal === 'itemid') ||
          (element.uri ===
            'http://schemas.microsoft.com/office/word/2010/wordml' &&
            local === 'docid' &&
            expanded.uri === element.uri &&
            keyLocal === 'val') ||
          (element.uri ===
            'http://schemas.microsoft.com/office/word/2012/wordml' &&
            local === 'docid' &&
            expanded.uri === element.uri &&
            keyLocal === 'val') ||
          (element.uri === wordNamespace &&
            local === 'guid' &&
            expanded.uri === wordNamespace &&
            keyLocal === 'val');
        const longHexDocumentId =
          element.uri ===
            'http://schemas.microsoft.com/office/word/2010/wordml' &&
          local === 'docid' &&
          expanded.uri === element.uri &&
          keyLocal === 'val' &&
          /^[\da-f]{8}$/i.test(value);
        if (guidMetadata && !guid && !longHexDocumentId)
          throw new Error('GUID DOCX no compatible');
        const styleName =
          element.uri === wordNamespace &&
          ['name', 'aliases'].includes(local) &&
          expanded.uri === wordNamespace &&
          keyLocal === 'val' &&
          value.length <= 1024 &&
          !/[{}\\<>]|url\s*\(|expression\s*\(|@import/i.test(value);
        const listSeparator =
          element.uri === wordNamespace &&
          local === 'listseparator' &&
          expanded.uri === wordNamespace &&
          keyLocal === 'val' &&
          /^[;,]$/.test(value);
        if (
          /^on/i.test(keyLocal) ||
          (/[{};\\<>]|url\s*\(|expression\s*\(|@import/i.test(value) &&
            !guidMetadata &&
            !styleName &&
            !listSeparator &&
            !(
              local === 'fldsimple' &&
              expanded.uri === wordNamespace &&
              keyLocal === 'instr' &&
              inertPageField(value)
            ))
        )
          throw new Error('Estilo o atributo DOCX no compatible');
        const graphicUri =
          element.uri ===
            'http://schemas.openxmlformats.org/drawingml/2006/main' &&
          local === 'graphicdata' &&
          !expanded.uri &&
          keyLocal === 'uri' &&
          [
            'http://schemas.openxmlformats.org/drawingml/2006/picture',
            'http://schemas.openxmlformats.org/drawingml/2006/chart',
            'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
          ].includes(value);
        const compatUri =
          element.uri === wordNamespace &&
          local === 'compatsetting' &&
          expanded.uri === wordNamespace &&
          keyLocal === 'uri' &&
          value === 'http://schemas.microsoft.com/office/word';
        if (
          /^[a-z][a-z0-9+.-]*:/i.test(value) &&
          keyLocal !== 'type' &&
          !graphicUri &&
          !compatUri
        )
          throw new Error('Recurso externo no compatible');
      }
      const attribute = (key: string, uri = '') =>
        attrs.get(JSON.stringify([uri, key])) || '';
      // Solo campos de paginación inertes; no se evalúan instrucciones ni enlaces.
      if (
        local === 'fldsimple' &&
        !syntaxOnly &&
        (element.uri !== wordNamespace ||
          !inertPageField(attribute('instr', wordNamespace)))
      )
        throw new Error('Campo DOCX no compatible');
      if (local === 'relationship') {
        if (
          element.uri !==
          'http://schemas.openxmlformats.org/package/2006/relationships'
        )
          throw new Error('Espacio de relación DOCX no compatible');
        if (
          (!syntaxOnly &&
            attribute('TargetMode').toLowerCase() === 'external') ||
          /(?:afchunk|font|oleobject|attachedtemplate|package|control)$/i.test(
            attribute('Type'),
          )
        )
          throw new Error('Relación DOCX no compatible');
        const target = attribute('Target');
        if (
          !target ||
          (!syntaxOnly &&
            /[\\?#%]|(^|\/)\.\.?($|\/)|^[a-z][a-z0-9+.-]*:|^\/\//i.test(target))
        )
          throw new Error('Destino DOCX no compatible');
      }
      if (local === 'override' || local === 'default') {
        if (
          element.uri !==
          'http://schemas.openxmlformats.org/package/2006/content-types'
        )
          throw new Error('Espacio de tipo DOCX no compatible');
        const contentType = attribute('ContentType');
        if (
          /html|javascript|svg|macro|oleobject|vba/i.test(contentType) ||
          (/font/i.test(contentType) &&
            contentType !==
              'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml')
        )
          throw new Error('Tipo DOCX no compatible');
      }
      if (!empty) stack.push({ name, ...element, namespaces });
    }
    if (stack.length || !roots || xml.slice(cursor).trim())
      throw new Error('XML corrupto');
  };
  for (const entry of Object.values(zip.files) as any[]) {
    if (entry.dir) continue;
    const name = entry.name;
    if (
      entry.unsafeOriginalName !== name ||
      !/^[A-Za-z0-9_\-./\[\] ]+$/.test(name) ||
      /(^|\/)\.\.?($|\/)/.test(name) ||
      name.startsWith('/')
    )
      throw new Error('Ruta DOCX no compatible');
    if (/\.(xml|rels)$/i.test(name)) {
      let xml = await entry.async('string');
      if (syntaxOnly && /^customXml\//i.test(name))
        xml = xml.replace(/<\?mso-contentType\?>/g, '');
      checkXml(xml, /^customXml\//i.test(name));
    } else if (syntaxOnly && /^word\/media\/[A-Za-z0-9_-]+\.wdp$/i.test(name)) {
      if ((await entry.async('nodebuffer')).length > 1048576)
        throw new Error('Imagen demasiado grande');
    } else if (/\.(png|jpe?g|gif|webp)$/i.test(name)) {
      const image = await entry.async('nodebuffer');
      if (image.length > 1048576) throw new Error('Imagen demasiado grande');
      const metadata = await require('sharp')(image, {
        limitInputPixels: 10000000,
      }).metadata();
      if (
        !['png', 'jpeg', 'gif', 'webp'].includes(metadata.format) ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 10000000 ||
        (metadata.pages || 1) > 1
      )
        throw new Error('Imagen fuera de los límites');
    } else throw new Error('Parte DOCX no compatible; descarga el original');
  }
}

export async function validateDocxPackage(bytes: Buffer): Promise<void> {
  validateOfficeZip(bytes);
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(
      `const {parentPort,workerData}=require('node:worker_threads'); (${inspectDocxPackage.toString()})(Buffer.from(workerData)).then(()=>parentPort.postMessage({ok:true}),error=>parentPort.postMessage({error:error.message}));`,
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
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker
        .terminate()
        .then(() => (error ? reject(error) : resolve()), reject);
    };
    const timer = setTimeout(
      () =>
        finish(new Error('El análisis DOCX superó el límite de 15 segundos')),
      15000,
    );
    worker.once('message', (result) =>
      finish(result.error ? new Error(result.error) : undefined),
    );
    worker.once('error', finish);
    worker.once('exit', () =>
      finish(new Error('El análisis DOCX terminó sin resultado')),
    );
  });
}
