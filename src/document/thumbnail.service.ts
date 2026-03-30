import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { join } from 'path';
import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly thumbnailPath = './uploads/thumbnails';
  private readonly thumbnailSize = 200; // Tamaño del thumbnail en px

  // Iconos por defecto para tipos de documentos
  private readonly defaultIcons: Record<string, string> = {
    'application/pdf': '📄',
    'application/msword': '📝',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      '📝',
    'application/vnd.ms-excel': '📊',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
    'application/vnd.ms-powerpoint': '📊',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      '📊',
    'text/plain': '📃',
    'text/csv': '📊',
    'application/zip': '🗜️',
    'application/x-rar-compressed': '🗜️',
    default: '📎',
  };

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
      // Validar que el archivo fuente existe
      if (!existsSync(filePath)) {
        this.logger.error(`Archivo fuente no encontrado: ${filePath}`);
        return null;
      }

      const thumbnailFilename = `thumb_${documentId}.jpg`;
      const thumbnailFullPath = join(this.thumbnailPath, thumbnailFilename);

      // Si ya existe el thumbnail, retornarlo
      if (existsSync(thumbnailFullPath)) {
        this.logger.debug(`Thumbnail ya existe: ${thumbnailFullPath}`);
        return thumbnailFullPath;
      }

      // Generar según el tipo de archivo
      if (mimetype.startsWith('image/')) {
        await this.generateImageThumbnail(filePath, thumbnailFullPath);
      } else if (mimetype === 'application/pdf') {
        // Para PDFs, renderizar primera página como imagen
        const generated = await this.generatePdfThumbnail(
          filePath,
          thumbnailFullPath,
        );
        if (!generated) {
          await this.generateIconThumbnail(mimetype, thumbnailFullPath, 'PDF');
        }
      } else if (this.isOfficeDocument(mimetype)) {
        // Para documentos de Office
        const label = this.getDocumentLabel(mimetype);
        await this.generateIconThumbnail(mimetype, thumbnailFullPath, label);
      } else if (mimetype.startsWith('text/')) {
        // Para archivos de texto
        await this.generateTextThumbnail(filePath, thumbnailFullPath, mimetype);
      } else if (this.isCompressedFile(mimetype)) {
        // Para archivos comprimidos
        await this.generateIconThumbnail(mimetype, thumbnailFullPath, 'ZIP');
      } else {
        // Tipo de archivo genérico
        await this.generateIconThumbnail(mimetype, thumbnailFullPath, 'FILE');
      }

      this.logger.log(`Thumbnail generado: ${thumbnailFullPath}`);
      return thumbnailFullPath;
    } catch (error: unknown) {
      this.logger.error(
        `Error generando thumbnail para documento ${documentId}:`,
        error instanceof Error ? error.message : error,
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
   * Genera thumbnail renderizando la primera página de un PDF
   */
  private async generatePdfThumbnail(
    pdfPath: string,
    outputPath: string,
  ): Promise<boolean> {
    let pdf: PDFParse | null = null;
    try {
      const dataBuffer = await readFile(pdfPath);
      pdf = new PDFParse({ data: new Uint8Array(dataBuffer) });

      const result = await pdf.getScreenshot({
        first: 1,
        imageBuffer: true,
        imageDataUrl: false,
        desiredWidth: 400,
      });

      if (!result.pages.length || !result.pages[0].data.length) {
        return false;
      }

      const pngBuffer = Buffer.from(result.pages[0].data);

      await sharp(pngBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'cover',
          position: 'top',
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      return true;
    } catch (error: unknown) {
      this.logger.warn(
        `PDF screenshot fallback para ${pdfPath}: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    } finally {
      if (pdf) {
        await pdf.destroy().catch(() => {});
      }
    }
  }

  /**
   * Genera thumbnail con icono representativo del tipo de archivo
   */
  private async generateIconThumbnail(
    mimetype: string,
    outputPath: string,
    label: string,
  ): Promise<void> {
    const svg = this.createIconSvg(mimetype, label);

    await sharp(Buffer.from(svg))
      .resize(this.thumbnailSize, this.thumbnailSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 90 })
      .toFile(outputPath);
  }

  /**
   * Genera thumbnail para archivos de texto mostrando contenido
   */
  private async generateTextThumbnail(
    textPath: string,
    outputPath: string,
    mimetype: string,
  ): Promise<void> {
    try {
      // Leer primeras líneas del archivo
      const content = readFileSync(textPath, 'utf-8');
      const preview = content.substring(0, 300); // Primeros 300 caracteres

      const svg = this.createTextPreviewSvg(preview);

      await sharp(Buffer.from(svg))
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality: 90 })
        .toFile(outputPath);
    } catch {
      // Si falla, usar icono genérico
      await this.generateIconThumbnail(mimetype, outputPath, 'TXT');
    }
  }

  /**
   * Crea un SVG con icono de documento
   */
  private createIconSvg(mimetype: string, label: string): string {
    const icon = this.getIconForMimetype(mimetype);
    const color = this.getColorForMimetype(mimetype);

    return `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="${color}"/>
        <text x="100" y="90" font-family="Arial, sans-serif" font-size="60"
              fill="white" text-anchor="middle" dominant-baseline="middle">
          ${icon}
        </text>
        <text x="100" y="150" font-family="Arial, sans-serif" font-size="24"
              font-weight="bold" fill="white" text-anchor="middle"
              dominant-baseline="middle">
          ${label}
        </text>
      </svg>
    `;
  }

  /**
   * Crea un SVG con preview de texto
   */
  private createTextPreviewSvg(content: string): string {
    // Escapar caracteres especiales XML
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // Dividir en líneas y tomar solo las primeras
    const lines = escapedContent.split('\n').slice(0, 10);

    const lineElements = lines
      .map((line, index) => {
        const y = 25 + index * 18;
        const truncated =
          line.length > 30 ? line.substring(0, 30) + '...' : line;
        return `<text x="10" y="${y}" font-family="Courier, monospace" font-size="12" fill="#333">${truncated}</text>`;
      })
      .join('\n');

    return `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="#f5f5f5"/>
        <rect width="200" height="20" fill="#4a90e2"/>
        <text x="10" y="14" font-family="Arial, sans-serif" font-size="12"
              font-weight="bold" fill="white">
          📃 TEXT FILE
        </text>
        ${lineElements}
      </svg>
    `;
  }

  /**
   * Genera thumbnail desde HTML usando Puppeteer
   */
  async generateThumbnailFromHtml(
    htmlContent: string,
    documentId: number,
  ): Promise<string | null> {
    let browser:
      | Awaited<ReturnType<(typeof import('puppeteer'))['launch']>>
      | undefined;
    try {
      const thumbnailFilename = `thumb_${documentId}.jpg`;
      const thumbnailFullPath = join(this.thumbnailPath, thumbnailFilename);

      // Si ya existe el thumbnail, retornarlo
      if (existsSync(thumbnailFullPath)) {
        this.logger.debug(`Thumbnail ya existe: ${thumbnailFullPath}`);
        return thumbnailFullPath;
      }

      this.logger.debug(
        `Generando thumbnail desde HTML para documento ${documentId}`,
      );

      // Intentar importar puppeteer dinámicamente
      let puppeteer: typeof import('puppeteer');
      try {
        puppeteer = await import('puppeteer');
      } catch {
        this.logger.error(
          'Puppeteer no está instalado. Ejecute: npm install puppeteer',
        );
        return null;
      }

      browser = await puppeteer.launch({
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

      // Inyectar fondo blanco en el HTML antes de renderizar
      // (headless Chrome usa fondo transparente por defecto)
      const bgStyle =
        '<style>html,body{background-color:#ffffff!important}</style>';
      const htmlWithBg = htmlContent.includes('</head>')
        ? htmlContent.replace('</head>', `${bgStyle}</head>`)
        : bgStyle + htmlContent;

      // Cargar el HTML
      await page.setContent(htmlWithBg, {
        waitUntil: 'networkidle0',
      });

      // Capturar screenshot
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: false, // Solo la primera página
      });

      // Redimensionar y convertir a JPEG usando sharp
      // flatten() aplana la transparencia sobre fondo blanco antes de convertir a JPEG
      await sharp(screenshotBuffer as Buffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: 'cover',
          position: 'top',
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailFullPath);

      this.logger.log(`Thumbnail generado exitosamente: ${thumbnailFullPath}`);
      return thumbnailFullPath;
    } catch (error: unknown) {
      this.logger.error(
        `Error generando thumbnail desde HTML:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError: unknown) {
          this.logger.error(
            'Error cerrando browser:',
            closeError instanceof Error ? closeError.message : closeError,
          );
        }
      }
    }
  }

  /**
   * Genera thumbnail desde un documento Office (Word, Excel, PowerPoint)
   */
  async generateOfficeThumbnail(
    _filePath: string,
    documentId: number,
    mimetype: string,
  ): Promise<string | null> {
    try {
      // Esta funcionalidad requiere herramientas externas
      // Por ahora, usar icono representativo
      const thumbnailFilename = `thumb_${documentId}.jpg`;
      const thumbnailFullPath = join(this.thumbnailPath, thumbnailFilename);

      const label = this.getDocumentLabel(mimetype);
      await this.generateIconThumbnail(mimetype, thumbnailFullPath, label);

      return thumbnailFullPath;
    } catch (error: unknown) {
      this.logger.error(
        `Error generando thumbnail Office para documento ${documentId}:`,
        error instanceof Error ? error.message : error,
      );
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
    try {
      const thumbnailPath = this.getThumbnailPath(documentId);
      if (thumbnailPath && existsSync(thumbnailPath)) {
        unlinkSync(thumbnailPath);
        this.logger.log(`Thumbnail eliminado: ${thumbnailPath}`);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error eliminando thumbnail del documento ${documentId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Regenera un thumbnail existente
   */
  async regenerateThumbnail(
    filePath: string,
    documentId: number,
    mimetype: string,
  ): Promise<string | null> {
    // Eliminar thumbnail existente
    this.deleteThumbnail(documentId);

    // Generar nuevo thumbnail
    return this.generateThumbnail(filePath, documentId, mimetype);
  }

  /**
   * Verifica si un thumbnail es válido
   */
  async validateThumbnail(documentId: number): Promise<boolean> {
    const thumbnailPath = this.getThumbnailPath(documentId);

    if (!thumbnailPath) {
      return false;
    }

    try {
      // Intentar leer los metadatos con sharp para validar
      const metadata = await sharp(thumbnailPath).metadata();
      return (metadata.width ?? 0) > 0 && (metadata.height ?? 0) > 0;
    } catch {
      this.logger.warn(
        `Thumbnail corrupto detectado para documento ${documentId}`,
      );
      return false;
    }
  }

  // ========== MÉTODOS AUXILIARES ==========

  /**
   * Verifica si es un documento de Office
   */
  private isOfficeDocument(mimetype: string): boolean {
    const officeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    return officeTypes.includes(mimetype);
  }

  /**
   * Verifica si es un archivo comprimido
   */
  private isCompressedFile(mimetype: string): boolean {
    const compressedTypes = [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/gzip',
      'application/x-tar',
    ];
    return compressedTypes.includes(mimetype);
  }

  /**
   * Obtiene la etiqueta para un tipo de documento
   */
  private getDocumentLabel(mimetype: string): string {
    const labels: Record<string, string> = {
      'application/pdf': 'PDF',
      'application/msword': 'DOC',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'DOCX',
      'application/vnd.ms-excel': 'XLS',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'XLSX',
      'application/vnd.ms-powerpoint': 'PPT',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        'PPTX',
      'text/plain': 'TXT',
      'text/csv': 'CSV',
      'application/zip': 'ZIP',
      'application/x-rar-compressed': 'RAR',
    };
    return labels[mimetype] || 'FILE';
  }

  /**
   * Obtiene el icono emoji para un tipo MIME
   */
  private getIconForMimetype(mimetype: string): string {
    return this.defaultIcons[mimetype] || this.defaultIcons['default'];
  }

  /**
   * Obtiene el color de fondo para un tipo de documento
   */
  private getColorForMimetype(mimetype: string): string {
    const colors: Record<string, string> = {
      'application/pdf': '#e74c3c',
      'application/msword': '#2980b9',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        '#2980b9',
      'application/vnd.ms-excel': '#27ae60',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        '#27ae60',
      'application/vnd.ms-powerpoint': '#d35400',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        '#d35400',
      'text/plain': '#95a5a6',
      'text/csv': '#16a085',
      'application/zip': '#8e44ad',
      'application/x-rar-compressed': '#8e44ad',
    };
    return colors[mimetype] || '#34495e';
  }

  /**
   * Obtiene información sobre los tipos de archivo soportados
   */
  getSupportedFileTypes(): {
    category: string;
    types: string[];
    thumbnail: string;
  }[] {
    return [
      {
        category: 'Imágenes',
        types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        thumbnail: 'Preview real de la imagen',
      },
      {
        category: 'PDFs',
        types: ['application/pdf'],
        thumbnail: 'Preview renderizado de la primera página',
      },
      {
        category: 'Documentos Office',
        types: [
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ],
        thumbnail: 'Icono representativo con color',
      },
      {
        category: 'Archivos de texto',
        types: ['text/plain', 'text/csv'],
        thumbnail: 'Preview del contenido',
      },
      {
        category: 'Archivos comprimidos',
        types: ['application/zip', 'application/x-rar-compressed'],
        thumbnail: 'Icono morado ZIP/RAR',
      },
      {
        category: 'Otros',
        types: ['*'],
        thumbnail: 'Icono genérico gris',
      },
    ];
  }
}
