import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { AuthoringAssetService } from './authoring-asset.service';

const ASSET_DIR = join(
  process.cwd(),
  'uploads',
  'active',
  'authoring',
  'assets',
);
const SOURCE_NAME = 'spec-crop-source.png';
const REFERENCED_NAME = 'spec-cleanup-referenced.png';
const ORPHAN_NAME = 'spec-cleanup-orphan.png';
const FRESH_NAME = 'spec-cleanup-fresh.png';
const SOURCE_URL = `/files/active/authoring/assets/${SOURCE_NAME}`;
const created: string[] = [];

function mockPrisma(referenced: string) {
  return {
    documentTemplateVersion: {
      findMany: jest.fn().mockResolvedValue([
        {
          bodyHtml: `<img src="/files/active/authoring/assets/${referenced}" />`,
          styles: null,
          headerHtml: null,
          footerHtml: null,
          pageFrame: null,
          signatures: null,
          fields: {},
        },
      ]),
    },
    documentAuthoring: { findMany: jest.fn().mockResolvedValue([]) },
    documentContentVersion: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('AuthoringAssetService', () => {
  beforeAll(() => {
    mkdirSync(ASSET_DIR, { recursive: true });
  });

  afterAll(() => {
    for (const file of created) {
      try {
        unlinkSync(join(ASSET_DIR, file));
      } catch {
        // ignore cleanup failures
      }
    }
  });

  it('crops a local asset and returns a new PNG', async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    writeFileSync(join(ASSET_DIR, SOURCE_NAME), source);
    created.push(SOURCE_NAME);

    const service = new AuthoringAssetService(mockPrisma(REFERENCED_NAME));
    const cropped = await service.crop({
      url: SOURCE_URL,
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });

    created.push(cropped.filename);
    expect(cropped.url).toMatch(/\.png$/);
    expect(existsSync(join(ASSET_DIR, cropped.filename))).toBe(true);
    const metadata = await sharp(join(ASSET_DIR, cropped.filename)).metadata();
    expect(metadata.width).toBe(2);
    expect(metadata.height).toBe(2);
  });

  it('rejects crops outside the image bounds', async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    writeFileSync(join(ASSET_DIR, SOURCE_NAME), source);
    created.push(SOURCE_NAME);

    const service = new AuthoringAssetService(mockPrisma(REFERENCED_NAME));
    await expect(
      service.crop({ url: SOURCE_URL, x: 4, y: 0, width: 1, height: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes old unreferenced assets and keeps referenced or fresh ones', async () => {
    writeFileSync(join(ASSET_DIR, REFERENCED_NAME), 'referenced');
    writeFileSync(join(ASSET_DIR, ORPHAN_NAME), 'orphan');
    writeFileSync(join(ASSET_DIR, FRESH_NAME), 'fresh');
    created.push(REFERENCED_NAME, ORPHAN_NAME, FRESH_NAME);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    utimesSync(join(ASSET_DIR, REFERENCED_NAME), twoDaysAgo, twoDaysAgo);
    utimesSync(join(ASSET_DIR, ORPHAN_NAME), twoDaysAgo, twoDaysAgo);

    const service = new AuthoringAssetService(mockPrisma(REFERENCED_NAME));
    const result = await service.cleanupOrphans();

    expect(result.deleted).toBe(1);
    expect(existsSync(join(ASSET_DIR, REFERENCED_NAME))).toBe(true);
    expect(existsSync(join(ASSET_DIR, ORPHAN_NAME))).toBe(false);
    expect(existsSync(join(ASSET_DIR, FRESH_NAME))).toBe(true);
  });
});
