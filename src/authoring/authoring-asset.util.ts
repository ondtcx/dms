import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';

export const ASSET_URL_PREFIX = '/files/';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

export function extensionForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

export function mimeForExtension(extension: string): string | null {
  return MIME_BY_EXT[extension.toLowerCase()] ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, dec: string) =>
      String.fromCodePoint(Number(dec)),
    )
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&period;/gi, '.');
}

export function isSafeSvg(content: string): boolean {
  const normalized = decodeEntities(content);
  if (
    /<script\b|<foreignObject\b|\bon\w+\s*=|@import\b|url\(\s*["']?\s*(?:\/\/|https?:|javascript:)/i.test(
      normalized,
    )
  ) {
    return false;
  }

  const hrefPattern =
    /(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefPattern.exec(normalized))) {
    const value = (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '').trim();
    if (!value.startsWith('#') && !value.startsWith('data:')) {
      return false;
    }
  }

  const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlPattern.exec(normalized))) {
    const value = (urlMatch[1] ?? '').trim();
    if (!value.startsWith('#') && !value.startsWith('data:')) {
      return false;
    }
  }

  return true;
}

export function localFilePath(url: string): string | null {
  if (!url.startsWith(ASSET_URL_PREFIX)) return null;
  const relative = url.slice(ASSET_URL_PREFIX.length);
  if (!relative || relative.includes('..')) return null;
  const filePath = join(process.cwd(), 'uploads', relative);
  return existsSync(filePath) ? filePath : null;
}

export function dataUriForLocalFile(url: string): string | null {
  const filePath = localFilePath(url);
  if (!filePath) return null;
  const mime = mimeForExtension(extname(filePath));
  if (!mime) return null;
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`;
}

const FILE_URL_PATTERN = /(?<=^|["'(=\s])\/files\/[A-Za-z0-9._~!$&*+,;=:@%/-]+/g;

export function resolveLocalAssets(html: string): string {
  if (!html) return html;
  return html.replace(FILE_URL_PATTERN, (match) => {
    return dataUriForLocalFile(match) ?? match;
  });
}

export function resolveFrameAssets(frame: any): any {
  if (!frame) return frame;
  const clone = JSON.parse(JSON.stringify(frame));
  for (const area of [clone.header, clone.footer, clone.body]) {
    if (!area) continue;
    if (typeof area.backgroundSvg === 'string' && area.backgroundSvg.includes(ASSET_URL_PREFIX)) {
      area.backgroundSvg = resolveLocalAssets(area.backgroundSvg);
    }
    for (const box of area.boxes ?? []) {
      if (typeof box.content !== 'string') continue;
      if (box.type === 'image') {
        box.content = dataUriForLocalFile(box.content) ?? box.content;
      } else if (box.content.includes(ASSET_URL_PREFIX)) {
        box.content = resolveLocalAssets(box.content);
      }
    }
  }
  return clone;
}
