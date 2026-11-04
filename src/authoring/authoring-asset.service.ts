import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  extensionForMime,
  isSafeSvg,
} from './authoring-asset.util';

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

  store(file?: Express.Multer.File): StoredAuthoringAsset {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No se recibió ningún archivo');
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen supera los 5 MB');
    }

    const extension = extensionForMime(file.mimetype);
    if (!extension) {
      throw new BadRequestException(
        'Solo se permiten imágenes PNG, JPEG, GIF, WEBP o SVG',
      );
    }

    if (file.mimetype === 'image/svg+xml') {
      const content = file.buffer.toString('utf8');
      if (!isSafeSvg(content)) {
        throw new BadRequestException(
          'El SVG contiene contenido no permitido',
        );
      }
    }

    if (!existsSync(this.assetDir)) {
      mkdirSync(this.assetDir, { recursive: true });
    }

    const filename = `asset_${Date.now()}_${randomBytes(4).toString('hex')}${extension}`;
    writeFileSync(join(this.assetDir, filename), file.buffer);

    return {
      url: `/files/active/authoring/assets/${filename}`,
      filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
