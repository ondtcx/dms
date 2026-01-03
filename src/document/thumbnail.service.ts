import { Injectable, Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import { pdf } from 'pdf-to-img';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly thumbnailPath = './uploads/thumbnails';
  private readonly thumbnailSize = 200; // Tamaño del thumbnail en px

  constructor() {
    // Asegurar que existe el directorio de thumbnails
    if (!existsSync(this.thumbnailPath)) {
      mkdirSync(this.thumbnailPath, { recursive: true });
    }
  }

  /**
   * Genera un thumbnail para un documento
   */
  async generateThumbnail(
    filePath: string,
    documentId: number,
    mimetype: string,
  ): Promise<string | null> {
    try {
      const thumbnailFilename = `thumb_${documentId}.jpg`;
      const thumbnailFullPath = join(this.thumbnailPath, thumbnailFilename);

      // Si ya existe el thumbnail, retornarlo
      if (existsSync(thumbnailFullPath)) {
        return thumbnailFullPath;
      }

      // Generar según el tipo de archivo
      if (mimetype.startsWith('image/')) {
        await this.generateImageThumbnail(filePath, thumbnailFullPath);
      } else if (mimetype === 'application/pdf') {
        await this.generatePdfThumbnail(filePath, thumbnailFullPath);
      } else {
        // No se puede generar thumbnail para este tipo
        return null;
      }

      this.logger.log(`Thumbnail generado: ${thumbnailFullPath}`);
      return thumbnailFullPath;
    } catch (error) {
      this.logger.error(
        `Error generando thumbnail para documento ${documentId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Genera thumbnail para una imagen
   */
  private async generateImageThumbnail(
    imagePath: string,
    outputPath: string,
  ): Promise<void> {
    await sharp(imagePath)
      .resize(this.thumbnailSize, this.thumbnailSize, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toFile(outputPath);
  }

  /**
   * Genera thumbnail para un PDF (primera página)
   */
  private async generatePdfThumbnail(
    pdfPath: string,
    outputPath: string,
  ): Promise<void> {
    try {
      // Convertir primera página del PDF a imagen
      const document = await pdf(pdfPath, { scale: 2.0 });

      // Obtener solo la primera página
      const page = await document.getPage(1);

      // Redimensionar y guardar como JPEG
      await sharp(page)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'cover',
          position: 'top',
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
    } catch (error) {
      this.logger.error('Error generando thumbnail de PDF:', error);
      throw error;
    }
  }

  /**
   * Obtiene la ruta del thumbnail si existe
   */
  getThumbnailPath(documentId: number): string | null {
    const thumbnailFilename = `thumb_${documentId}.jpg`;
    const thumbnailFullPath = join(this.thumbnailPath, thumbnailFilename);

    if (existsSync(thumbnailFullPath)) {
      return thumbnailFullPath;
    }

    return null;
  }

  /**
   * Elimina el thumbnail de un documento
   */
  deleteThumbnail(documentId: number): void {
    const thumbnailPath = this.getThumbnailPath(documentId);
    if (thumbnailPath && existsSync(thumbnailPath)) {
      const fs = require('fs');
      fs.unlinkSync(thumbnailPath);
      this.logger.log(`Thumbnail eliminado: ${thumbnailPath}`);
    }
  }
}
