export const SAMPLE_HEADER_HTML = `<div style="position:relative;width:100%;font-family:Arial,Helvetica,sans-serif;padding:0 1.8cm;box-sizing:border-box;">
  <svg width="100%" height="34" viewBox="0 0 800 34" preserveAspectRatio="none" style="position:absolute;top:0;left:0;">
    <path d="M0,0 H800 V8 C640,30 500,2 340,18 C180,34 90,6 0,20 Z" fill="#7cb342"/>
    <path d="M0,0 H800 V3 C640,18 500,0 340,8 C180,16 90,0 0,10 Z" fill="#33691e"/>
  </svg>
  <table style="width:100%;border-collapse:collapse;margin-top:18px;">
    <tr>
      <td style="width:110px;vertical-align:middle;text-align:center;">
        {{#if institucion.logo}}<img src="{{institucion.logo}}" style="height:56px;object-fit:contain;" />{{/if}}
        <div style="font-size:7px;font-style:italic;color:#2e7d32;line-height:1.1;margin-top:2px;">Fundado el 16 de<br/>Diciembre de 1913</div>
      </td>
      <td style="text-align:center;vertical-align:middle;padding:0 10px;">
        <div style="font-size:15px;font-weight:700;font-style:italic;color:#111827;">{{institucion.nombre}}</div>
        <div style="font-size:9.5px;font-style:italic;color:#374151;margin-top:2px;">&ldquo;Pioneros en ciencia y tecnología al servicio del pueblo&rdquo;</div>
      </td>
      <td style="width:110px;"></td>
    </tr>
  </table>
  <div style="border-bottom:3px solid #7cb342;margin-top:8px;"></div>
</div>`;

export const SAMPLE_BODY_PREFIX = `<div data-authoring-left-bar="true" style="position:fixed;top:70pt;bottom:0;left:0;width:4px;background:#7cb342;z-index:0;"></div>`;

export const SAMPLE_FOOTER_HTML = `<div style="position:relative;width:100%;font-family:Arial,Helvetica,sans-serif;padding:0 1.8cm;box-sizing:border-box;">
  <svg width="100%" height="24" viewBox="0 0 800 24" preserveAspectRatio="none" style="position:absolute;bottom:0;left:0;">
    <path d="M0,24 H800 V16 C640,0 500,22 340,10 C180,0 90,18 0,8 Z" fill="#7cb342"/>
    <path d="M0,24 H800 V21 C640,8 500,24 340,16 C180,8 90,22 0,14 Z" fill="#33691e"/>
  </svg>
  <div style="border-top:3px solid #7cb342;margin-bottom:4px;"></div>
  <table style="width:100%;border-collapse:collapse;font-size:8px;color:#111827;line-height:1.35;">
    <tr>
      <td style="width:70%;vertical-align:top;padding-bottom:12px;">
        <div><span style="font-style:italic;font-weight:700;">Dirección:</span> {{institucion.direccion}}</div>
        <div><span style="font-style:italic;font-weight:700;">Teléfono:</span> {{institucion.telefono}}</div>
        <div><span style="font-style:italic;font-weight:700;">Correo:</span> {{institucion.email}}</div>
      </td>
      <td style="text-align:right;vertical-align:bottom;padding-bottom:16px;">
        Página <span class="pageNumber"></span> de <span class="totalPages"></span>
      </td>
    </tr>
  </table>
</div>`;

export const SAMPLE_MARGINS = {
  marginTop: '3.2cm',
  marginBottom: '3cm',
  marginLeft: '2cm',
  marginRight: '2cm',
};

const SAMPLE_HEADER_BACKGROUND =
  SAMPLE_HEADER_HTML.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';
const SAMPLE_FOOTER_BACKGROUND =
  SAMPLE_FOOTER_HTML.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? '';

export const ACTA_PAGE_FRAME: any = {
  version: 1,
  pageSize: 'Letter',
  orientation: 'portrait',
  margins: {
    top: SAMPLE_MARGINS.marginTop,
    bottom: SAMPLE_MARGINS.marginBottom,
    left: '1.2cm',
    right: SAMPLE_MARGINS.marginRight,
  },
  bodyPrefixHtml: SAMPLE_BODY_PREFIX,
  header: {
    backgroundSvg: SAMPLE_HEADER_BACKGROUND,
    boxes: [
      {
        id: 'logo',
        type: 'image',
        x: 41,
        y: 12,
        width: 40,
        height: 50,
        fontSize: 0,
        content: '{{institucion.logo}}',
      },
      {
        id: 'institution',
        type: 'text',
        x: 235.5,
        y: 36.4,
        width: 240,
        fontSize: 11,
        fontFamily: '"Arial Black", Arial, sans-serif',
        fontWeight: '900',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: '{{institucion.nombre}}',
      },
      {
        id: 'motto',
        type: 'text',
        x: 224.7,
        y: 50.3,
        width: 255,
        fontSize: 11,
        fontFamily: 'Calibri, Carlito, Arial, sans-serif',
        fontWeight: '700',
        fontStyle: 'italic',
        color: '#111827',
        align: 'left',
        content: '“Pioneros en ciencia y tecnología al servicio del pueblo”',
      },
      {
        id: 'founding-1',
        type: 'text',
        x: 31.9,
        y: 56,
        width: 62,
        fontSize: 7.9,
        fontFamily: 'Calibri, Carlito, Arial, sans-serif',
        fontWeight: '700',
        fontStyle: 'italic',
        color: '#2e7d32',
        align: 'left',
        content: 'Fundado el 16 de',
      },
      {
        id: 'founding-2',
        type: 'text',
        x: 29.4,
        y: 65.8,
        width: 62,
        fontSize: 7.9,
        fontFamily: 'Calibri, Carlito, Arial, sans-serif',
        fontWeight: '700',
        fontStyle: 'italic',
        color: '#2e7d32',
        align: 'left',
        content: 'Diciembre de 1913',
      },
    ],
  },
  footer: {
    backgroundSvg: SAMPLE_FOOTER_BACKGROUND,
    boxes: [
      {
        id: 'address-label',
        type: 'text',
        x: 128.4,
        y: 15.5,
        width: 48,
        fontSize: 10.9,
        fontFamily: 'Georgia, serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: 'Dirección:',
      },
      {
        id: 'address-value',
        type: 'text',
        x: 176,
        y: 15.5,
        width: 300,
        fontSize: 11,
        fontFamily: 'Georgia, serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: '{{institucion.direccion}}',
      },
      {
        id: 'phone-label',
        type: 'text',
        x: 128.4,
        y: 41,
        width: 45,
        fontSize: 10.9,
        fontFamily: 'Georgia, serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: 'Teléfono:',
      },
      {
        id: 'phone-value',
        type: 'text',
        x: 173.4,
        y: 41,
        width: 80,
        fontSize: 11,
        fontFamily: 'Georgia, serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: '{{institucion.telefono}}',
      },
      {
        id: 'email-label',
        type: 'text',
        x: 128.4,
        y: 53.7,
        width: 40,
        fontSize: 10.9,
        fontFamily: 'Georgia, serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: 'Correo:',
      },
      {
        id: 'email-value',
        type: 'text',
        x: 164,
        y: 53.7,
        width: 200,
        fontSize: 11,
        fontFamily: 'Georgia, serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'left',
        content: '{{institucion.email}}',
      },
      {
        id: 'page-number',
        type: 'pageNumber',
        x: 480,
        y: 50,
        width: 110,
        fontSize: 8,
        fontFamily: 'Arial, sans-serif',
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#111827',
        align: 'right',
        content:
          'Página <span class="pageNumber"></span> de <span class="totalPages"></span>',
      },
    ],
  },
};

export const ACTA_SIGNATURES = {
  items: [
    {
      id: 'recibi',
      title: 'RECIBÍ CONFORME',
      name: '{{recibidoPor.nombre}}',
      role: '{{recibidoPor.cargo}}',
      fullWidth: false,
    },
    {
      id: 'entregue',
      title: 'ENTREGUÉ CONFORME',
      name: '{{entregadoPor.nombre}}',
      role: '{{entregadoPor.cargo}}',
      fullWidth: false,
    },
    {
      id: 'visto-bueno',
      title: 'VISTO BUENO',
      name: '{{vistoBueno.nombre}}',
      role: '{{vistoBueno.cargo}}',
      fullWidth: true,
    },
  ],
};

export const ACTA_FIELDS = {
  fields: [
    { key: 'acta.lugar', label: 'Lugar', type: 'text', required: true },
    { key: 'acta.fecha', label: 'Fecha', type: 'date', required: true },
    { key: 'contenido', label: 'Cuerpo del acta', type: 'richtext', required: true },
    { key: 'recibidoPor.nombre', label: 'Recibió: nombre', type: 'text', required: true },
    { key: 'recibidoPor.cargo', label: 'Recibió: cargo', type: 'text', required: true },
    { key: 'entregadoPor.nombre', label: 'Entregó: nombre', type: 'text', required: true },
    { key: 'entregadoPor.cargo', label: 'Entregó: cargo', type: 'text', required: true },
    { key: 'vistoBueno.nombre', label: 'Visto bueno: nombre', type: 'text', required: true },
    { key: 'vistoBueno.cargo', label: 'Visto bueno: cargo', type: 'text', required: true },
  ],
};

export const ACTA_BODY_HTML = `<div class="doc">
  <h1 class="doc-title">ACTA ENTREGA - RECEPCIÓN</h1>
  <h2 class="doc-subtitle">CONSEJO EJECUTIVO</h2>
  <p>En {{acta.lugar}}, {{formatDate acta.fecha}}.</p>
  {{{contenido}}}
  <p>Se firman en original y copia con el mismo tenor.</p>
</div>`;

function frameBoxToHtml(box: any): string {
  if (box.type === 'image') {
    const image = `<img src="${box.content}" style="position:absolute;left:${box.x}pt;top:${box.y}pt;width:${box.width}pt;height:${box.height ?? 50}pt;object-fit:contain;" />`;
    return box.content === '{{institucion.logo}}'
      ? `{{#if institucion.logo}}${image}{{/if}}`
      : image;
  }
  return `<div style="position:absolute;left:${box.x}pt;top:${box.y}pt;width:${box.width}pt;font-size:${box.fontSize}pt;font-family:${box.fontFamily ?? 'Arial, sans-serif'};font-weight:${box.fontWeight ?? '400'};font-style:${box.fontStyle ?? 'normal'};color:${box.color ?? '#111827'};text-align:${box.align ?? 'left'};line-height:1.15;white-space:pre-wrap;">${box.content}</div>`;
}

export function pageFrameAreaToHtml(area: any): string {
  const boxes = (area.boxes ?? []).map(frameBoxToHtml).join('');
  return `<div style="position:relative;width:100%;height:100%;">${area.backgroundSvg ?? ''}${boxes}</div>`;
}

export function pageFrameToHeaderHtml(frame: any): string {
  return pageFrameAreaToHtml(frame.header);
}

export function pageFrameToFooterHtml(frame: any): string {
  return pageFrameAreaToHtml(frame.footer);
}
