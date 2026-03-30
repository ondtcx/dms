import { Injectable, Logger } from '@nestjs/common';
import Handlebars from 'handlebars';
import puppeteer, { type Browser, type PDFOptions } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export interface GenerateDocumentOptions {
  htmlTemplate: string;
  styles?: string;
  data: Record<string, any>;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  outputFormat?: 'pdf' | 'html';
}

@Injectable()
export class DocumentGeneratorService {
  private readonly logger = new Logger(DocumentGeneratorService.name);

  constructor() {
    this.registerHandlebarsHelpers();
    this.registerInstitutionPartial();
  }

  /**
   * Registra el partial reutilizable de cabecera institucional.
   * Usa inline styles para ser independiente del CSS de cada plantilla.
   */
  private registerInstitutionPartial() {
    Handlebars.registerPartial(
      'institutionHeader',
      `<div style="text-align:center;margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid #d1d5db;">` +
        `{{#if _metadata.institutionLogo}}<img src="{{_metadata.institutionLogo}}" alt="Logo" style="height:52px;object-fit:contain;display:block;margin:0 auto 6px;">{{/if}}` +
        `{{#if _metadata.institutionName}}<div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:2px;">{{_metadata.institutionName}}</div>{{/if}}` +
        `{{#if _metadata.institutionAddress}}<div style="font-size:9.5px;color:#6b7280;">{{_metadata.institutionAddress}}</div>{{/if}}` +
        `{{#if _metadata.institutionPhone}}<div style="font-size:9.5px;color:#6b7280;">{{_metadata.institutionPhone}}{{#if _metadata.institutionEmail}} &nbsp;·&nbsp; {{_metadata.institutionEmail}}{{/if}}</div>{{/if}}` +
        `{{#if _metadata.schoolYearName}}<div style="font-size:9px;color:#9ca3af;margin-top:2px;">Año Escolar {{_metadata.schoolYearName}}</div>{{/if}}` +
        `</div>`,
    );
  }

  /**
   * Registra helpers personalizados para Handlebars
   */
  private registerHandlebarsHelpers() {
    // Helper para formatear fechas
    Handlebars.registerHelper('formatDate', function (date: string) {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Helper para formatear horas
    Handlebars.registerHelper('formatTime', function (time: string) {
      if (!time) return '';
      return time;
    });

    // Helper condicional (block helper)
    Handlebars.registerHelper('if_eq', function (a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    // Helper para verificar si no es igual (para usar con unless)
    Handlebars.registerHelper('isNotEqual', function (a, b) {
      return a !== b;
    });

    // Helper para capitalizar
    Handlebars.registerHelper('capitalize', function (str: string) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Helper para saltos de línea
    Handlebars.registerHelper('nl2br', function (text: string) {
      if (!text) return '';
      return new Handlebars.SafeString(
        text.replace(/\n/g, '<br>').replace(/\r/g, ''),
      );
    });
  }

  /**
   * Compila la plantilla HTML con los datos proporcionados
   */
  private compileTemplate(
    htmlTemplate: string,
    data: Record<string, any>,
  ): string {
    try {
      const template = Handlebars.compile(htmlTemplate);
      return template(data);
    } catch (error) {
      this.logger.error('Error compilando plantilla:', error);
      throw new Error(`Error al compilar plantilla: ${error.message}`);
    }
  }

  /**
   * Genera HTML completo con estilos
   */
  private generateHtmlWithStyles(
    compiledHtml: string,
    customStyles?: string,
  ): string {
    // Estilos por defecto para PDFs
    const defaultStyles = `
      @page {
        margin: 2cm;
      }
      body {
        font-family: 'Arial', 'Helvetica', sans-serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #333;
      }
      h1 {
        font-size: 24pt;
        color: #000;
        margin-bottom: 20px;
      }
      h2 {
        font-size: 18pt;
        color: #000;
        margin-top: 20px;
        margin-bottom: 15px;
      }
      h3 {
        font-size: 14pt;
        color: #000;
        margin-top: 15px;
        margin-bottom: 10px;
      }
      p {
        margin-bottom: 10px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      th {
        background-color: #f2f2f2;
        font-weight: bold;
      }
      .page-break {
        page-break-after: always;
      }
    `;

    // Si el HTML ya tiene estructura completa, solo agregar estilos
    if (compiledHtml.includes('<!DOCTYPE') || compiledHtml.includes('<html')) {
      // Inyectar estilos en el head existente
      return compiledHtml.replace(
        '</head>',
        `<style>${defaultStyles}${customStyles || ''}</style></head>`,
      );
    }

    // Si no, crear estructura completa
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Documento</title>
        <style>
          ${defaultStyles}
          ${customStyles || ''}
        </style>
      </head>
      <body>
        ${compiledHtml}
      </body>
      </html>
    `;
  }

  /**
   * Genera un documento PDF usando Puppeteer
   */
  async generatePDF(options: GenerateDocumentOptions): Promise<Buffer> {
    const {
      htmlTemplate,
      styles,
      data,
      pageSize = 'A4',
      orientation = 'portrait',
    } = options;

    let browser: Browser | null = null;

    try {
      // Compilar plantilla con datos
      const compiledHtml = this.compileTemplate(htmlTemplate, data);
      console.log(
        '🔧 HTML Compilado (primeros 500 chars):',
        compiledHtml.substring(0, 500),
      );

      // Generar HTML completo con estilos
      const fullHtml = this.generateHtmlWithStyles(compiledHtml, styles);
      console.log(
        '📄 HTML Completo (primeros 500 chars):',
        fullHtml.substring(0, 500),
      );

      this.logger.log('Iniciando generación de PDF...');

      // Iniciar navegador headless
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();

      // Establecer contenido HTML
      await page.setContent(fullHtml, {
        waitUntil: 'networkidle0',
      });

      // Configurar opciones de PDF según tamaño de página
      const pdfOptions: PDFOptions = {
        format: pageSize,
        landscape: orientation === 'landscape',
        printBackground: true,
        margin: {
          top: '2cm',
          right: '2cm',
          bottom: '2cm',
          left: '2cm',
        },
      };

      // Generar PDF
      const pdfBuffer = await page.pdf(pdfOptions);

      this.logger.log('PDF generado exitosamente');

      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error('Error generando PDF:', error);
      throw new Error(`Error al generar PDF: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Genera HTML (para previsualización o descarga)
   */
  async generateHTML(options: GenerateDocumentOptions): Promise<string> {
    const { htmlTemplate, styles, data } = options;

    try {
      // Compilar plantilla con datos
      const compiledHtml = this.compileTemplate(htmlTemplate, data);

      // Generar HTML completo con estilos
      const fullHtml = this.generateHtmlWithStyles(compiledHtml, styles);

      return fullHtml;
    } catch (error) {
      this.logger.error('Error generando HTML:', error);
      throw new Error(`Error al generar HTML: ${error.message}`);
    }
  }

  /**
   * Guarda el buffer del documento en el sistema de archivos
   */
  async saveDocumentToFile(
    buffer: Buffer,
    filename: string,
    uploadDir: string,
  ): Promise<string> {
    try {
      // Asegurar que el directorio existe
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filepath = path.join(uploadDir, filename);

      // Guardar archivo
      fs.writeFileSync(filepath, buffer);

      this.logger.log(`Documento guardado en: ${filepath}`);

      return filepath;
    } catch (error) {
      this.logger.error('Error guardando documento:', error);
      throw new Error(`Error al guardar documento: ${error.message}`);
    }
  }

  /**
   * Genera previsualización HTML del documento
   */
  async previewDocument(
    htmlTemplate: string,
    data: Record<string, any>,
    styles?: string,
  ): Promise<string> {
    return this.generateHTML({
      htmlTemplate,
      data,
      styles,
    });
  }
}
