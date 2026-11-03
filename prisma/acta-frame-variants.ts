import * as fs from 'fs';
import * as path from 'path';

type FrameConfig = {
  title: string;
  subtitle: string;
  date: string;
  bodyHeight: number;
  signature: 'single' | 'list';
  signatureLabel: string;
  signatureName: string;
  signatureRole: string;
  signatureFlowHtml: string;
};

export const ACTA_FRAME_CONFIGS: Record<string, FrameConfig> = {
  'Oficio institucional': {
    title: 'OFICIO',
    subtitle: 'COMUNICACIÓN OFICIAL',
    date: '{{documento.fecha}} · {{documento.numero}}',
    bodyHeight: 350,
    signature: 'single',
    signatureLabel: 'FIRMANTE',
    signatureName: '{{firmante.nombre}}',
    signatureRole: '{{firmante.cargo}}',
    signatureFlowHtml:
      '<div class="flow-signatures"><div class="flow-sig-full"><div class="flow-sig-title">FIRMANTE</div><div class="flow-sig-line"></div><div class="flow-sig-name">{{firmante.nombre}}</div><div class="flow-sig-role">{{firmante.cargo}}</div></div></div>',
  },
  'Memorando institucional': {
    title: 'MEMORANDO',
    subtitle: 'COMUNICACIÓN INTERNA',
    date: '{{documento.fecha}} · {{documento.numero}}',
    bodyHeight: 350,
    signature: 'single',
    signatureLabel: 'FIRMANTE',
    signatureName: '{{firmante.nombre}}',
    signatureRole: '{{firmante.cargo}}',
    signatureFlowHtml:
      '<div class="flow-signatures"><div class="flow-sig-full"><div class="flow-sig-title">FIRMANTE</div><div class="flow-sig-line"></div><div class="flow-sig-name">{{firmante.nombre}}</div><div class="flow-sig-role">{{firmante.cargo}}</div></div></div>',
  },
  'Circular institucional': {
    title: 'CIRCULAR',
    subtitle: 'COMUNICACIÓN GENERAL',
    date: '{{documento.fecha}} · {{documento.numero}}',
    bodyHeight: 350,
    signature: 'single',
    signatureLabel: 'FIRMANTE',
    signatureName: '{{firmante.nombre}}',
    signatureRole: '{{firmante.cargo}}',
    signatureFlowHtml:
      '<div class="flow-signatures"><div class="flow-sig-full"><div class="flow-sig-title">FIRMANTE</div><div class="flow-sig-line"></div><div class="flow-sig-name">{{firmante.nombre}}</div><div class="flow-sig-role">{{firmante.cargo}}</div></div></div>',
  },
  'Acta institucional': {
    title: 'ACTA',
    subtitle: 'CONSEJO EJECUTIVO',
    date: '{{formatDate acta.fecha}} · {{acta.hora}} · {{acta.lugar}}',
    bodyHeight: 240,
    signature: 'list',
    signatureLabel: 'FIRMANTES',
    signatureName: '{{#each acta.firmantes}}<div>{{this}}</div>{{/each}}',
    signatureRole: '',
    signatureFlowHtml:
      '<div class="flow-signatures"><div class="flow-sig-full"><div class="flow-sig-title">FIRMANTES</div><div class="flow-sig-line"></div><div class="flow-sig-name">{{#each acta.firmantes}}<div>{{this}}</div>{{/each}}</div></div></div>',
  },
  'Constancia institucional': {
    title: 'CONSTANCIA',
    subtitle: 'CERTIFICACIÓN',
    date: '{{documento.fecha}}',
    bodyHeight: 350,
    signature: 'single',
    signatureLabel: 'FIRMANTE',
    signatureName: '{{firmante.nombre}}',
    signatureRole: '{{firmante.cargo}}',
    signatureFlowHtml:
      '<div class="flow-signatures"><div class="flow-sig-full"><div class="flow-sig-title">FIRMANTE</div><div class="flow-sig-line"></div><div class="flow-sig-name">{{firmante.nombre}}</div><div class="flow-sig-role">{{firmante.cargo}}</div></div></div>',
  },
  'Informe institucional': {
    title: 'INFORME',
    subtitle: 'INFORME DE ACTIVIDADES',
    date: '{{documento.fecha}} · {{documento.numero}}',
    bodyHeight: 350,
    signature: 'single',
    signatureLabel: 'FIRMANTE',
    signatureName: '{{firmante.nombre}}',
    signatureRole: '{{firmante.cargo}}',
    signatureFlowHtml:
      '<div class="flow-signatures"><div class="flow-sig-full"><div class="flow-sig-title">FIRMANTE</div><div class="flow-sig-line"></div><div class="flow-sig-name">{{firmante.nombre}}</div><div class="flow-sig-role">{{firmante.cargo}}</div></div></div>',
  },
};

export function buildActaFrame(name: string): any {
  const config = ACTA_FRAME_CONFIGS[name];
  if (!config) throw new Error(`No frame config for ${name}`);
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'prisma/templates/acta-entrega-page-frame.json'),
    'utf8',
  );
  const frame = JSON.parse(raw);
  const boxes = frame.body.boxes as any[];
  const byId = (id: string) => boxes.find((box) => box.id === id);

  const title = byId('acta-5');
  if (title) {
    title.content = config.title;
    title.width = 0;
    title.center = true;
  }
  const subtitle = byId('acta-6');
  if (subtitle) {
    subtitle.content = config.subtitle;
    subtitle.width = 0;
    subtitle.center = true;
  }
  const date = byId('acta-7');
  if (date) date.content = config.date;
  const body = byId('acta-body');
  if (body) {
    body.content = '{{{prebody}}}{{{contenido}}}';
    body.height = config.bodyHeight;
  }

  const remove = new Set<string>();
  if (config.signature === 'single') {
    ['acta-19', 'acta-20', 'acta-21', 'acta-22', 'acta-23', 'acta-24', 'acta-25', 'acta-26'].forEach(
      (id) => remove.add(id),
    );
    const label = byId('acta-27');
    if (label) label.content = config.signatureLabel;
    const nameBox = byId('acta-29');
    if (nameBox) nameBox.content = config.signatureName;
    const role = byId('acta-30');
    if (role) role.content = config.signatureRole;
  } else {
    ['acta-20', 'acta-22', 'acta-24', 'acta-26', 'acta-27', 'acta-28', 'acta-29', 'acta-30'].forEach(
      (id) => remove.add(id),
    );
    const label = byId('acta-19');
    if (label) label.content = config.signatureLabel;
    const nameBox = byId('acta-23');
    if (nameBox) {
      nameBox.content = config.signatureName;
      nameBox.raw = true;
    }
    const role = byId('acta-25');
    if (role) {
      role.content = config.signatureRole;
      role.raw = true;
    }
  }

  frame.body.boxes = boxes.filter((box) => !remove.has(box.id));
  frame.signatureFlowHtml = config.signatureFlowHtml;
  frame.frameVersion = 2;
  return frame;
}
