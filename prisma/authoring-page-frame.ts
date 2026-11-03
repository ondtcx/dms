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

export const SAMPLE_BODY_PREFIX = `<div data-authoring-left-bar="true" style="position:fixed;top:0;left:1.2cm;height:100vh;width:4px;background:#7cb342;z-index:0;"></div>`;

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
