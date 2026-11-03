import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { DocumentGeneratorService } from '../document-template/document-generator.service';
import type { AuthoringField } from './authoring.types';
import { ROLE_LABELS } from './authoring-fields';
import {
  buildInstitutionContext,
  getInstitutionMetadata,
  type InstitutionMetadata,
} from './institution-metadata';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface AuthoringTemplateShape {
  bodyHtml: string;
  styles?: string | null;
  pageSize?: string | null;
  orientation?: string | null;
}

@Injectable()
export class AuthoringRendererService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly generator: DocumentGeneratorService,
  ) {}

  getInstitutionMetadata(): Promise<InstitutionMetadata> {
    return getInstitutionMetadata(this.settingsService);
  }

  buildContext(
    template: AuthoringTemplateShape,
    formData: Record<string, any>,
    user: { name?: string; role?: string },
    options: { documentNumber?: string | null; documentDate?: Date; draft?: boolean },
    metadata: InstitutionMetadata,
  ): Record<string, any> {
    const institution = buildInstitutionContext(metadata);
    const date = options.documentDate ?? new Date();
    const roleLabel = ROLE_LABELS[user.role ?? ''] ?? user.role ?? '';
    const firmante = formData.firmante ?? {
      nombre: user.name ?? '',
      cargo: roleLabel,
    };

    return {
      ...formData,
      firmante,
      institucion: institution,
      documento: {
        ...(formData.documento ?? {}),
        fecha: date.toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        numero: options.documentNumber || 'BORRADOR',
        tipo: (template as any).template?.name ?? '',
      },
      remitente: {
        nombre: user.name ?? '',
        cargo: roleLabel,
      },
      _metadata: {
        ...metadata,
        draft: Boolean(options.draft),
      },
    };
  }

  async renderHtml(
    template: AuthoringTemplateShape,
    formData: Record<string, any>,
    user: { name?: string; role?: string },
    options: { documentNumber?: string | null; documentDate?: Date; draft?: boolean },
  ): Promise<string> {
    const metadata = await this.getInstitutionMetadata();
    const context = this.buildContext(template, formData, user, options, metadata);
    return this.generator.generateHTML({
      htmlTemplate: template.bodyHtml,
      styles: template.styles ?? undefined,
      data: context,
    });
  }

  async generatePdf(
    template: AuthoringTemplateShape,
    formData: Record<string, any>,
    user: { name?: string; role?: string },
    options: { documentNumber?: string | null; documentDate?: Date; draft?: boolean },
  ): Promise<Buffer> {
    const metadata = await this.getInstitutionMetadata();
    const context = this.buildContext(template, formData, user, options, metadata);
    const institutionName = escapeHtml(metadata.institutionName ?? '');
    const footerTemplate =
      `<div style="width:100%;font-size:8px;color:#6b7280;padding:0 2cm;display:flex;justify-content:space-between;">` +
      `<span>${institutionName}</span>` +
      `<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>` +
      `</div>`;

    return this.generator.generatePDF({
      htmlTemplate: template.bodyHtml,
      styles: template.styles ?? undefined,
      data: context,
      pageSize: (template.pageSize as any) || 'A4',
      orientation: (template.orientation as any) || 'portrait',
      outputFormat: 'pdf',
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
      margin: {
        top: '2cm',
        right: '2cm',
        bottom: '2.2cm',
        left: '2cm',
      },
    });
  }

  sampleFormData(fields: AuthoringField[]): Record<string, any> {
    const data: Record<string, any> = {};
    for (const field of fields) {
      const segments = field.key.split('.');
      let current = data;
      for (const segment of segments.slice(0, -1)) {
        current[segment] = current[segment] ?? {};
        current = current[segment];
      }
      const key = segments[segments.length - 1];
      if (field.defaultValue !== undefined) {
        current[key] = field.defaultValue;
        continue;
      }
      switch (field.type) {
        case 'date':
          current[key] = new Date().toISOString().slice(0, 10);
          break;
        case 'time':
          current[key] = '09:00';
          break;
        case 'number':
          current[key] = 1;
          break;
        case 'checkbox':
          current[key] = true;
          break;
        case 'list':
          current[key] = ['Elemento de ejemplo'];
          break;
        case 'select':
          current[key] = field.options?.[0]?.value ?? '';
          break;
        case 'richtext':
          current[key] = `<p>${field.label} de ejemplo.</p>`;
          break;
        default:
          current[key] = `${field.label} de ejemplo`;
          break;
      }
    }
    return data;
  }
}
