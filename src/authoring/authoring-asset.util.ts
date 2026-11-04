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

export function isSafeSvg(content: string): boolean {
  return !/<script\b|<foreignObject\b|\bon\w+\s*=|\b(?:href|xlink:href)\s*=\s*["']?(?:https?:|javascript:)|@import\b|url\(\s*["']?(?:https?:|javascript:)/i.test(
    content,
  );
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

const FILE_URL_PATTERN = /(?<![\w:./-])\/files\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+/g;

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
