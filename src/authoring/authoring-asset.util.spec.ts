import { mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  dataUriForLocalFile,
  extensionForMime,
  isSafeSvg,
  localFilePath,
  mimeForExtension,
  resolveFrameAssets,
  resolveLocalAssets,
} from './authoring-asset.util';

const ASSET_DIR = join(
  process.cwd(),
  'uploads',
  'active',
  'authoring',
  'assets',
);
const FIXTURE_NAME = 'test-resolve-asset.png';
const FIXTURE_URL = `/files/active/authoring/assets/${FIXTURE_NAME}`;
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

describe('authoring asset utilities', () => {
  beforeAll(() => {
    mkdirSync(ASSET_DIR, { recursive: true });
    writeFileSync(join(ASSET_DIR, FIXTURE_NAME), Buffer.from(PNG_BASE64, 'base64'));
  });

  afterAll(() => {
    try {
      unlinkSync(join(ASSET_DIR, FIXTURE_NAME));
    } catch {
      // ignore cleanup failures
    }
  });

  it('maps supported image mime types to extensions', () => {
    expect(extensionForMime('image/png')).toBe('.png');
    expect(extensionForMime('image/jpeg')).toBe('.jpg');
    expect(extensionForMime('image/gif')).toBe('.gif');
    expect(extensionForMime('image/webp')).toBe('.webp');
    expect(extensionForMime('image/svg+xml')).toBe('.svg');
    expect(extensionForMime('application/pdf')).toBeNull();
  });

  it('maps extensions to mime types', () => {
    expect(mimeForExtension('.png')).toBe('image/png');
    expect(mimeForExtension('.JPEG')).toBe('image/jpeg');
    expect(mimeForExtension('.svg')).toBe('image/svg+xml');
    expect(mimeForExtension('.exe')).toBeNull();
  });

  it('accepts a plain SVG and rejects unsafe SVG content', () => {
    expect(
      isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>'),
    ).toBe(true);
    expect(isSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(isSafeSvg('<svg><foreignObject /></svg>')).toBe(false);
    expect(isSafeSvg('<svg onload="alert(1)" />')).toBe(false);
    expect(
      isSafeSvg('<svg><image href="https://example.com/a.png" /></svg>'),
    ).toBe(false);
    expect(
      isSafeSvg('<svg><style>@import url("https://example.com/a.css");</style></svg>'),
    ).toBe(false);
    expect(
      isSafeSvg('<svg><use href="#icon" /></svg>'),
    ).toBe(true);
  });

  it('rejects path traversal and missing local files', () => {
    expect(localFilePath('/files/../etc/passwd')).toBeNull();
    expect(localFilePath('/files/active/authoring/assets/missing.png')).toBeNull();
    expect(dataUriForLocalFile('/files/active/authoring/assets/missing.png')).toBeNull();
  });

  it('resolves local files to data URIs in HTML', () => {
    const resolved = resolveLocalAssets(
      `<img src="${FIXTURE_URL}" />`,
    );
    expect(resolved).toContain('data:image/png;base64,');
    expect(resolved).not.toContain(FIXTURE_URL);
  });

  it('resolves image boxes and backgrounds in a page frame', () => {
    const frame = {
      header: {
        backgroundSvg: `<img src="${FIXTURE_URL}" />`,
        boxes: [{ type: 'image', content: FIXTURE_URL }],
      },
    };
    const resolved = resolveFrameAssets(frame);

    expect(resolved.header.backgroundSvg).toContain('data:image/png;base64,');
    expect(resolved.header.boxes[0].content).toContain('data:image/png;base64,');
    expect(frame.header.boxes[0].content).toBe(FIXTURE_URL);
  });

  it('leaves HTML without local files unchanged', () => {
    const html = '<img src="https://example.com/logo.png" />';
    expect(resolveLocalAssets(html)).toBe(html);
    expect(
      resolveLocalAssets('http://localhost:3001/files/active/authoring/assets/x.png'),
    ).toBe('http://localhost:3001/files/active/authoring/assets/x.png');
  });

  it('does not rewrite file-like text inside data URIs', () => {
    const dataUri = 'data:image/png;base64,AAAA/files/AAAA';
    const html = `<img src="${dataUri}" />`;
    expect(resolveLocalAssets(html)).toBe(html);
  });
});
