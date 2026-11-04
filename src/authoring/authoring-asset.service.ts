import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { randomBytes } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import {
  collectAssetFilenames,
  extensionForMime,
  isSafeSvg,
  localFilePath,
} from './authoring-asset.util';
import type { CropAuthoringAssetDto } from './dto/authoring.dto';
import { PrismaService } from '../prisma/prisma.service';

export interface StoredAuthoringAsset {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class AuthoringAssetService {
  private readonly assetDir = join(
    process.cwd(),
    'uploads',
    'active',
    'authoring',
    'assets',
  );

  constructor(private readonly prisma: PrismaService) {}

  async store(file?: Express.Multer.File): Promise<StoredAuthoringAsset> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen supera los 5 MB');
    }

    let extension = extensionForMime(file.mimetype);
    if (!extension) {
      throw new BadRequestException(
        'Solo se permiten imágenes PNG, JPEG, GIF, WEBP o SVG',
      );
    }

    let buffer = file.buffer;
    let mimeType = file.mimetype;
    if (file.mimetype === 'image/svg+xml') {
      const content = file.buffer.toString('utf8');
      if (!isSafeSvg(content)) {
        throw new BadRequestException(
          'El SVG contiene contenido no permitido',
        );
      }

      try {
        buffer = await sharp(file.buffer, { limitInputPixels: 40_000_000 })
          .resize({
            width: 2000,
            height: 2000,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
      } catch {
        throw new BadRequestException('No se pudo procesar el SVG');
      }
      extension = '.png';
      mimeType = 'image/png';
    }

    if (!existsSync(this.assetDir)) {
      mkdirSync(this.assetDir, { recursive: true });
    }

    return this.saveBuffer(buffer, mimeType, extension);
  }

  async crop(payload: CropAuthoringAssetDto): Promise<StoredAuthoringAsset> {
    const filePath = localFilePath(payload.url);
    if (!filePath || dirname(filePath) !== this.assetDir) {
      throw new BadRequestException(
        'Solo se pueden recortar imágenes de plantilla',
      );
    }

    const metadata = await sharp(filePath)
      .metadata()
      .catch(() => null);
    const sourceWidth = metadata?.width ?? 0;
    const sourceHeight = metadata?.height ?? 0;
    if (!sourceWidth || !sourceHeight) {
      throw new BadRequestException('No se pudo leer la imagen');
    }

    if (payload.x >= sourceWidth || payload.y >= sourceHeight) {
      throw new BadRequestException('El recorte está fuera de la imagen');
    }

    const x = payload.x;
    const y = payload.y;
    const width = Math.min(payload.width, sourceWidth - x);
    const height = Math.min(payload.height, sourceHeight - y);
    if (width < 1 || height < 1) {
      throw new BadRequestException('El recorte no es válido');
    }

    const buffer = await sharp(filePath)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer()
      .catch(() => null);
    if (!buffer) {
      throw new BadRequestException('No se pudo recortar la imagen');
    }

    return this.saveBuffer(buffer, 'image/png', '.png');
  }

  async cleanupOrphans(
    graceMs = 24 * 60 * 60 * 1000,
  ): Promise<{ scanned: number; deleted: number; kept: number }> {
    const [versions, authoringDocuments, contentVersions] = await Promise.all([
      this.prisma.documentTemplateVersion.findMany({
        select: {
          bodyHtml: true,
          styles: true,
          headerHtml: true,
          footerHtml: true,
          pageFrame: true,
          signatures: true,
          fields: true,
        },
      }),
      this.prisma.documentAuthoring.findMany({
        select: { pageFrame: true },
      }),
      this.prisma.documentContentVersion.findMany({
        select: { htmlSnapshot: true, pageFrame: true },
      }),
    ]);

    const referenced = collectAssetFilenames([
      ...versions,
      ...authoringDocuments,
      ...contentVersions,
    ]);

    if (!existsSync(this.assetDir)) {
      return { scanned: 0, deleted: 0, kept: 0 };
    }

    const cutoff = Date.now() - graceMs;
    let scanned = 0;
    let deleted = 0;
    let kept = 0;

    for (const file of readdirSync(this.assetDir)) {
      scanned += 1;
      const filePath = join(this.assetDir, file);
      const stats = statSync(filePath);
      if (referenced.has(file) || stats.mtimeMs > cutoff) {
        kept += 1;
        continue;
      }
      unlinkSync(filePath);
      deleted += 1;
    }

    return { scanned, deleted, kept };
  }

  private saveBuffer(
    buffer: Buffer,
    mimeType: string,
    extension: string,
  ): StoredAuthoringAsset {
    if (!existsSync(this.assetDir)) {
      mkdirSync(this.assetDir, { recursive: true });
    }

    const filename = `asset_${Date.now()}_${randomBytes(4).toString('hex')}${extension}`;
    writeFileSync(join(this.assetDir, filename), buffer);

    return {
      url: `/files/active/authoring/assets/${filename}`,
      filename,
      mimeType,
      size: buffer.length,
    };
  }
}
