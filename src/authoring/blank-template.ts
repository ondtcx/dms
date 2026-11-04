import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * System template used by the editor-first creation flow.
 *
 * It is intentionally hidden from the public template library (`isBlank`) and
 * only provides the institutional frame plus one rich-text body field. The
 * document metadata (name, description, type, academic year, origin date) is
 * supplied by the creation dialog and stored on the Document itself.
 */
export const BLANK_TEMPLATE_NAME = 'Documento en blanco';

export const BLANK_TEMPLATE_DESCRIPTION =
  'Documento institucional creado directamente en el editor.';

export const BLANK_TEMPLATE_FIELDS = {
  fields: [
    {
      key: 'contenido',
      label: 'Contenido',
      type: 'richtext',
      required: false,
    },
  ],
};

export const BLANK_TEMPLATE_BODY_HTML = `
<div class="doc">
  <div class="content">{{{contenido}}}</div>
</div>`;

export const BLANK_TEMPLATE_STYLES = `
.doc { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111827; }
.content { text-align: justify; line-height: 1.55; }
.content p { margin: 0 0 8pt; line-height: 1.55; text-align: justify; }
.content p:last-child { margin-bottom: 0; }
.content ul, .content ol { margin: 0 0 8pt 20pt; padding: 0; }
.content h1 { font-size: 15pt; margin: 0 0 8pt; }
.content h2 { font-size: 13pt; margin: 0 0 8pt; }
.content h3 { font-size: 11.5pt; margin: 0 0 8pt; }
.content table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
.content th, .content td { border: 1px solid #9ca3af; padding: 4pt 6pt; vertical-align: top; }
`;

export const BLANK_TEMPLATE_HEADER_HTML = `
<div style="font-family: Arial, Helvetica, sans-serif; text-align: center; border-bottom: 2px solid #7cb342; padding-bottom: 6px;">
  <div style="font-size: 14px; font-weight: 700; font-style: italic; color: #111827;">{{institucion.nombre}}</div>
  <div style="font-size: 9px; color: #374151; margin-top: 2px;">
    {{institucion.direccion}} · {{institucion.telefono}} · {{institucion.email}}
  </div>
</div>`;

export const BLANK_TEMPLATE_FOOTER_HTML = `
<div style="font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #374151; text-align: right; border-top: 1px solid #7cb342; padding-top: 4px;">
  Página <span class="pageNumber"></span> de <span class="totalPages"></span>
</div>`;

export const BLANK_TEMPLATE_MARGINS = {
  marginTop: '3.2cm',
  marginBottom: '3cm',
  marginLeft: '2cm',
  marginRight: '2cm',
};

export const BLANK_TEMPLATE_NUMBER_PREFIX = 'GEN';


/** Institutional variant: exact Acta de entrega-recepción page frame. */
export const BLANK_TEMPLATE_INSTITUTIONAL_NAME =
  'Documento en blanco institucional';

export const BLANK_TEMPLATE_INSTITUTIONAL_DESCRIPTION =
  'Documento institucional creado en el editor con el marco del Acta de entrega-recepción.';

let cachedInstitutionalFrame: any;

/** Reads the exact institutional frame lazily so the service can run without
 * bundling the large SVG/JSON asset into the compiled source. */
export function getInstitutionalBlankFrame() {
  if (cachedInstitutionalFrame) return cachedInstitutionalFrame;
  const file = join(
    process.cwd(),
    'prisma/templates/acta-entrega-page-frame.json',
  );
  cachedInstitutionalFrame = JSON.parse(readFileSync(file, 'utf8'));
  return cachedInstitutionalFrame;
}
