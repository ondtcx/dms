import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as sharp from 'sharp';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';

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
        throw new UnprocessableEntityException(
          'Tipo de archivo no soportado para thumbnail',
        );
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
   * Nota: En Windows, la conversión PDF→imagen con librerías nativas tiene problemas
   * Esta funcionalidad está deshabilitada temporalmente
   */
  private async generatePdfThumbnail(
    pdfPath: string,
    outputPath: string,
  ): Promise<void> {
    throw new Error('PDF thumbnail generation not supported on Windows. Use generateThumbnailFromHtml instead.');
  }

  /**
   * Genera thumbnail desde HTML usando Puppeteer
   * Esta es la solución recomendada para Windows
   */
  async generateThumbnailFromHtml(
    htmlContent: string,
    documentId: number,
  ): Promise<string | null> {
    try {
      const thumbnailFilename = `thumb_${documentId}.jpg`;
      const thumbnailFullPath = join(this.thumbnailPath, thumbnailFilename);

      // Si ya existe el thumbnail, retornarlo
      if (existsSync(thumbnailFullPath)) {
        return thumbnailFullPath;
      }

      this.logger.debug(`Generando thumbnail desde HTML para documento ${documentId}`);

      // Importar puppeteer dinámicamente
      const puppeteer = await import('puppeteer');

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Configurar viewport para simular tamaño A4
      await page.setViewport({
        width: 794, // A4 width en px a 96dpi
        height: 1123, // A4 height en px a 96dpi
        deviceScaleFactor: 2, // Para mejor calidad
      });

      // Cargar el HTML
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
      });

      // Capturar screenshot
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false, // Solo la primera página
      });

      await browser.close();

      // Redimensionar y convertir a JPEG usando sharp
      await sharp(screenshotBuffer)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'cover',
          position: 'top',
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailFullPath);

      this.logger.log(`Thumbnail generado exitosamente: ${thumbnailFullPath}`);
      return thumbnailFullPath;
    } catch (error) {
      this.logger.error(`Error generando thumbnail desde HTML:`, error.message);
      return null;
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
