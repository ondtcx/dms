import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
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
  headerHtml?: string | null;
  footerHtml?: string | null;
  marginTop?: string | null;
  marginBottom?: string | null;
  marginLeft?: string | null;
  marginRight?: string | null;
  signatures?: any;
  pageFrame?: any;
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

  private bodyHtmlForRender(template: AuthoringTemplateShape): string {
    if (template.pageFrame?.mode === 'fullPage') return template.bodyHtml;
    let body = template.pageFrame?.bodyPrefixHtml
      ? `${template.pageFrame.bodyPrefixHtml}${template.bodyHtml}`
      : template.bodyHtml;
    if (template.headerHtml?.trim()) {
      // Un encabezado de página reemplaza el partial de cabecera del cuerpo.
      body = body.replace(/\{\{>\s*institutionHeader\s*\}\}/g, '');
    }
    const signatures = this.buildSignatures(template.signatures);
    return signatures ? `${body}${signatures}` : body;
  }

  private buildSignatures(raw: any): string {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    if (!items.length) return '';

    const line =
      '<div style="border-top:1px solid #111827;width:62%;margin:0 auto 6px;"></div>';
    const inner = (item: any) => `
      <div style="font-weight:700;margin-bottom:46px;">${item.title || ''}</div>
      ${line}
      <div>${item.name || ''}</div>
      <div>${item.role || ''}</div>`;

    const normal = items.filter((item: any) => !item.fullWidth);
    const full = items.filter((item: any) => item.fullWidth);
    let rows = '';
    for (let index = 0; index < normal.length; index += 2) {
      const left = normal[index];
      const right = normal[index + 1];
      rows += `<tr>
        <td style="width:50%;text-align:center;vertical-align:top;padding:0 18px 30px;border:none;">${inner(left)}</td>
        <td style="width:50%;text-align:center;vertical-align:top;padding:0 18px 30px;border:none;">${right ? inner(right) : ''}</td>
      </tr>`;
    }
    for (const item of full) {
      rows += `<tr>
        <td colspan="2" style="text-align:center;vertical-align:top;padding:0 18px 24px;border:none;">${inner(item)}</td>
      </tr>`;
    }

    return `<div style="margin-top:42px;"><table style="width:100%;border-collapse:collapse;border:none;">${rows}</table></div>`;
  }

  private compilePageFragment(
    html: string | null | undefined,
    context: Record<string, any>,
  ): string | undefined {
    if (!html?.trim()) return undefined;
    return Handlebars.compile(html)(context);
  }

  private stylesForRender(template: AuthoringTemplateShape): string | undefined {
    const base = template.styles ?? '';
    if (template.headerHtml?.trim() || template.footerHtml?.trim()) {
      const top = template.marginTop || '3.2cm';
      const right = template.marginRight || '2cm';
      const bottom = template.marginBottom || '3cm';
      const left = template.marginLeft || '2cm';
      return `${base}\n@page { margin: ${top} ${right} ${bottom} ${left}; }`;
    }
    return base || undefined;
  }

  async renderHtml(
    template: AuthoringTemplateShape,
    formData: Record<string, any>,
    user: { name?: string; role?: string },
    options: { documentNumber?: string | null; documentDate?: Date; draft?: boolean },
  ): Promise<string> {
    const metadata = await this.getInstitutionMetadata();
    const context = this.buildContext(template, formData, user, options, metadata);
    if (template.pageFrame?.mode === 'fullPage') {
      return this.generator.generateHTML({
        htmlTemplate: template.bodyHtml,
        styles: template.styles ?? undefined,
        data: context,
      });
    }
    return this.generator.generateHTML({
      htmlTemplate: this.bodyHtmlForRender(template),
      styles: this.stylesForRender(template),
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
    const defaultFooter =
      `<div style="width:100%;font-size:8px;color:#6b7280;padding:0 2cm;display:flex;justify-content:space-between;">` +
      `<span>${institutionName}</span>` +
      `<span><span class="pageNumber"></span> / <span class="totalPages"></span></span>` +
      `</div>`;

    if (template.pageFrame?.mode === 'fullPage') {
      return this.generator.generatePDF({
        htmlTemplate: template.bodyHtml,
        styles: template.styles ?? undefined,
        data: context,
        pageSize: (template.pageSize as any) || 'Letter',
        orientation: (template.orientation as any) || 'portrait',
        outputFormat: 'pdf',
        displayHeaderFooter: false,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
    }

    const headerTemplate = this.compilePageFragment(template.headerHtml, context);
    const customFooter = this.compilePageFragment(template.footerHtml, context);
    const footerTemplate = customFooter ?? defaultFooter;

    return this.generator.generatePDF({
      htmlTemplate: this.bodyHtmlForRender(template),
      styles: this.stylesForRender(template),
      data: context,
      pageSize: (template.pageSize as any) || 'A4',
      orientation: (template.orientation as any) || 'portrait',
      outputFormat: 'pdf',
      displayHeaderFooter: true,
      headerTemplate: headerTemplate ?? '<div></div>',
      footerTemplate,
      margin: {
        top: template.marginTop || (headerTemplate ? '3.2cm' : '2cm'),
        right: template.marginRight || '2cm',
        bottom: template.marginBottom || (customFooter ? '3cm' : '2.2cm'),
        left: template.marginLeft || '2cm',
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
