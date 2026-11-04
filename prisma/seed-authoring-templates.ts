import { PrismaClient, TemplateVersionStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { UserRole } from '../src/auth/role.enum';
import { ACTA_FRAME_CONFIGS, buildActaFrame } from './acta-frame-variants';
import {
  SAMPLE_BODY_PREFIX,
  SAMPLE_FOOTER_HTML,
  SAMPLE_HEADER_HTML,
  SAMPLE_MARGINS,
} from './authoring-page-frame';
import {
  BLANK_TEMPLATE_BODY_HTML,
  BLANK_TEMPLATE_DESCRIPTION,
  BLANK_TEMPLATE_FIELDS,
  BLANK_TEMPLATE_FOOTER_HTML,
  BLANK_TEMPLATE_HEADER_HTML,
  BLANK_TEMPLATE_INSTITUTIONAL_DESCRIPTION,
  BLANK_TEMPLATE_INSTITUTIONAL_NAME,
  BLANK_TEMPLATE_MARGINS,
  BLANK_TEMPLATE_NAME,
  BLANK_TEMPLATE_NUMBER_PREFIX,
  BLANK_TEMPLATE_STYLES,
} from '../src/authoring/blank-template';

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
};

const field = (
  key: string,
  label: string,
  type: string,
  required = false,
): Field => ({ key, label, type, required });

const styles = `
.doc { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111827; }
.doc-title { text-align: center; font-size: 15pt; font-weight: 700; margin: 6px 0 18px; letter-spacing: 1px; }
.meta { display: flex; justify-content: space-between; font-size: 10pt; color: #374151; margin: 4px 0 16px; }
.recipient { margin: 14px 0; line-height: 1.35; }
.subject { margin: 16px 0; }
.content { text-align: justify; line-height: 1.55; }
.signature { margin-top: 54px; text-align: center; line-height: 1.4; break-inside: avoid; page-break-inside: avoid; }
.muted { color: #6b7280; font-size: 9pt; }
ul { margin: 4px 0 8px 18px; }
.draft-watermark { position: fixed; top: 42%; left: 8%; transform: rotate(-28deg); font-size: 86px; font-weight: 700; color: rgba(15, 23, 42, 0.08); z-index: -1; letter-spacing: 8px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; }
th, td { border: 1px solid #9ca3af; padding: 4px 6px; vertical-align: top; }
`;

const watermark =
  '{{#if _metadata.draft}}<div class="draft-watermark">BORRADOR</div>{{/if}}';

const ACTA_EXACT_BODY_HTML = fs.readFileSync(
  path.join(process.cwd(), 'prisma/templates/acta-entrega-recepcion.html'),
  'utf8',
);
const ACTA_EXACT_PAGE_FRAME: any = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'prisma/templates/acta-entrega-page-frame.json'),
    'utf8',
  ),
);
const ACTA_EXACT_BODY_DOC: any = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'prisma/templates/acta-entrega-body.json'),
    'utf8',
  ),
);
const ACTA_EXACT_FIELDS: any[] = [
  field('acta.lugar', 'Lugar', 'text', true),
  field('acta.fecha', 'Fecha', 'date', true),
  {
    ...field('contenido', 'Cuerpo del acta', 'richtext', true),
    defaultValue: ACTA_EXACT_BODY_DOC,
  },
  field('recibidoPor.nombre', 'Recibido por', 'text', true),
  field('recibidoPor.cargo', 'Cargo de quien recibe', 'text', true),
  field('entregadoPor.nombre', 'Entregado por', 'text', true),
  field('entregadoPor.cargo', 'Cargo de quien entrega', 'text', true),
  field('vistoBueno.nombre', 'Visto bueno', 'text', true),
  field('vistoBueno.cargo', 'Cargo del visto bueno', 'text', true),
];

const signature = `
<div class="signature">
  <div>{{firmante.nombre}}</div>
  <div>{{firmante.cargo}}</div>
</div>`;

const CONSTANCIA_BODY_DOC: any = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Por el siguiente motivo: ' }],
    },
  ],
};

const CONSTANCIA_COMMON_BODY = `
${watermark}
<div class="doc">
  <div class="doc-title">CONSTANCIA</div>
  <div class="content">
    <p>Se certifica que <strong>{{estudiante.nombre}}</strong>, estudiante del curso
    <strong>{{estudiante.curso}}</strong>, paralelo <strong>{{estudiante.paralelo}}</strong>,
    del período académico <strong>{{periodo.nombre}}</strong>, ha solicitado la presente
    constancia.</p>
    <div class="content">{{{contenido}}}</div>
    <p>Se expide la presente constancia para los fines que el interesado estime convenientes.</p>
  </div>
  ${signature}
</div>`;

async function applyActaFrames(
  prisma: PrismaClient,
  adminId: string,
): Promise<void> {
  for (const name of Object.keys(ACTA_FRAME_CONFIGS)) {
    const template = await prisma.documentTemplate.findFirst({
      where: { name, catalog: 'institutional' },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!template) continue;
    const latest = template.versions[0];
    if (!latest) continue;

    const frame = buildActaFrame(name);
    const config = ACTA_FRAME_CONFIGS[name];
    const latestFields = ((latest.fields as any)?.fields ?? []) as any[];
    const latestFrame = latest.pageFrame as any;
    const already =
      latestFrame?.mode === 'fullPage' &&
      latestFrame?.frameVersion === 2 &&
      latestFrame?.signatureFlowHtml === config.signatureFlowHtml &&
      latestFrame?.body?.boxes?.find((box: any) => box.id === 'acta-body')
        ?.height === config.bodyHeight &&
      latestFrame?.body?.boxes?.find((box: any) => box.id === 'acta-5')
        ?.content === config.title &&
      latestFrame?.body?.boxes?.find((box: any) => box.id === 'acta-7')
        ?.content === config.date &&
      (name !== 'Constancia institucional' ||
        latestFields.some((field) => field.key === 'contenido'));
    if (already) continue;

    let fields = latestFields;
    if (name === 'Constancia institucional') {
      fields = [
        ...latestFields.filter(
          (field) =>
            field.key !== 'constancia.motivo' && field.key !== 'contenido',
        ),
        {
          key: 'contenido',
          label: 'Cuerpo de la constancia',
          type: 'richtext',
          required: true,
          defaultValue: CONSTANCIA_BODY_DOC,
        },
      ];
    }

    await prisma.documentTemplateVersion.create({
      data: {
        templateId: template.id,
        version: latest.version + 1,
        status: TemplateVersionStatus.PUBLISHED,
        bodyHtml: latest.bodyHtml,
        styles: '',
        headerHtml: null,
        footerHtml: null,
        marginTop: '0',
        marginBottom: '0',
        marginLeft: '0',
        marginRight: '0',
        pageSize: 'Letter',
        orientation: 'portrait',
        numberPrefix: latest.numberPrefix,
        pageFrame: frame as any,
        signatures: null,
        fields: { fields } as any,
        createdById: adminId,
        publishedAt: new Date(),
      },
    });
    await prisma.documentTemplateVersion.updateMany({
      where: {
        templateId: template.id,
        status: TemplateVersionStatus.PUBLISHED,
        NOT: { version: latest.version + 1 },
      },
      data: { status: TemplateVersionStatus.RETIRED },
    });
    await prisma.documentTemplate.update({
      where: { id: template.id },
      data: {
        isActive: true,
        htmlTemplate: latest.bodyHtml,
        styles: '',
        fields: { fields } as any,
        pageSize: 'Letter',
        orientation: 'portrait',
      },
    });
  }
}

const templates = [
  {
    name: 'Oficio institucional',
    documentTypeName: 'Oficio',
    description: 'Comunicación oficial para destinatarios internos o externos.',
    numberPrefix: 'OFI',
    fields: [
      field('destinatario.nombre', 'Nombre del destinatario', 'text', true),
      field('destinatario.cargo', 'Cargo del destinatario', 'text', true),
      field('documento.asunto', 'Asunto', 'text', true),
      field('contenido', 'Contenido', 'richtext', true),
      field('firmante.nombre', 'Nombre del firmante', 'text', true),
      field('firmante.cargo', 'Cargo del firmante', 'text', true),
    ],
    bodyHtml: `
${watermark}
<div class="doc">
  {{> institutionHeader}}
  <div class="doc-title">OFICIO</div>
  <div class="meta"><span>{{documento.fecha}}</span><span>{{documento.numero}}</span></div>
  <div class="recipient">
    <div>{{destinatario.nombre}}</div>
    <div>{{destinatario.cargo}}</div>
  </div>
  <div class="subject"><strong>Asunto:</strong> {{documento.asunto}}</div>
  <div class="content">{{{contenido}}}</div>
  ${signature}
</div>`,
  },
  {
    name: 'Memorando institucional',
    documentTypeName: 'Memorando',
    description: 'Comunicación interna entre dependencias de la institución.',
    numberPrefix: 'MEM',
    fields: [
      field('destinatario.nombre', 'Nombre del destinatario', 'text', true),
      field('destinatario.cargo', 'Cargo del destinatario', 'text', true),
      field('destinatario.dependencia', 'Dependencia del destinatario', 'text', true),
      field('documento.asunto', 'Asunto', 'text', true),
      field('contenido', 'Contenido', 'richtext', true),
      field('firmante.nombre', 'Nombre del firmante', 'text', true),
      field('firmante.cargo', 'Cargo del firmante', 'text', true),
    ],
    bodyHtml: `
${watermark}
<div class="doc">
  {{> institutionHeader}}
  <div class="doc-title">MEMORANDO</div>
  <div class="meta"><span>{{documento.fecha}}</span><span>{{documento.numero}}</span></div>
  <div class="recipient">
    <div><strong>Para:</strong> {{destinatario.nombre}}</div>
    <div>{{destinatario.cargo}}</div>
    <div>{{destinatario.dependencia}}</div>
  </div>
  <div class="subject"><strong>Asunto:</strong> {{documento.asunto}}</div>
  <div class="content">{{{contenido}}}</div>
  ${signature}
</div>`,
  },
  {
    name: 'Circular institucional',
    documentTypeName: 'Circular',
    description: 'Comunicación dirigida a varios destinatarios.',
    numberPrefix: 'CIR',
    fields: [
      field('circular.destinatarios', 'Destinatarios (uno por línea)', 'list', true),
      field('documento.asunto', 'Asunto', 'text', true),
      field('contenido', 'Contenido', 'richtext', true),
      field('firmante.nombre', 'Nombre del firmante', 'text', true),
      field('firmante.cargo', 'Cargo del firmante', 'text', true),
    ],
    bodyHtml: `
${watermark}
<div class="doc">
  {{> institutionHeader}}
  <div class="doc-title">CIRCULAR</div>
  <div class="meta"><span>{{documento.fecha}}</span><span>{{documento.numero}}</span></div>
  <div class="recipient">
    <strong>Para:</strong>
    <ul>{{#each circular.destinatarios}}<li>{{this}}</li>{{/each}}</ul>
  </div>
  <div class="subject"><strong>Asunto:</strong> {{documento.asunto}}</div>
  <div class="content">{{{contenido}}}</div>
  ${signature}
</div>`,
  },
  {
    name: 'Acta institucional',
    documentTypeName: 'Acta de Consejo',
    description: 'Registro de reuniones, consejos y acuerdos institucionales.',
    numberPrefix: 'ACT',
    fields: [
      field('acta.fecha', 'Fecha', 'date', true),
      field('acta.hora', 'Hora', 'time', true),
      field('acta.lugar', 'Lugar', 'text', true),
      field('acta.asistentes', 'Asistentes (uno por línea)', 'list', true),
      field('contenido', 'Desarrollo y acuerdos', 'richtext', true),
      field('acta.firmantes', 'Firmantes (uno por línea)', 'list', true),
    ],
    bodyHtml: `
${watermark}
<div class="doc">
  {{> institutionHeader}}
  <div class="doc-title">ACTA</div>
  <div class="meta">
    <span>{{acta.fecha}}</span>
    <span>{{acta.hora}}</span>
    <span>{{acta.lugar}}</span>
  </div>
  <div class="recipient">
    <strong>Asistentes:</strong>
    <ul>{{#each acta.asistentes}}<li>{{this}}</li>{{/each}}</ul>
  </div>
  <div class="content">{{{contenido}}}</div>
  <div class="signature">
    {{#each acta.firmantes}}<div>{{this}}</div>{{/each}}
  </div>
</div>`,
  },
  {
    name: 'Constancia institucional',
    documentTypeName: 'Constancia de Estudios',
    description: 'Constancia de estudios, conducta o participación.',
    numberPrefix: 'CON',
    fields: [
      field('estudiante.nombre', 'Nombre del estudiante', 'text', true),
      field('estudiante.curso', 'Curso', 'text', true),
      field('estudiante.paralelo', 'Paralelo', 'text', true),
      field('periodo.nombre', 'Período académico', 'text', true),
      field('constancia.motivo', 'Motivo de emisión', 'textarea', true),
      field('firmante.nombre', 'Nombre del firmante', 'text', true),
      field('firmante.cargo', 'Cargo del firmante', 'text', true),
    ],
    bodyHtml: `
${watermark}
<div class="doc">
  {{> institutionHeader}}
  <div class="doc-title">CONSTANCIA</div>
  <div class="content">
    <p>Se certifica que <strong>{{estudiante.nombre}}</strong>, estudiante del curso
    <strong>{{estudiante.curso}}</strong>, paralelo <strong>{{estudiante.paralelo}}</strong>,
    del período académico <strong>{{periodo.nombre}}</strong>, ha solicitado la presente
    constancia por el siguiente motivo:</p>
    <p>{{nl2br constancia.motivo}}</p>
    <p>Se expide la presente constancia para los fines que el interesado estime convenientes.</p>
  </div>
  ${signature}
</div>`,
  },
  {
    name: 'Informe institucional',
    documentTypeName: 'Informe de Rendimiento',
    description: 'Informe de actividades, resultados o situaciones institucionales.',
    numberPrefix: 'INF',
    fields: [
      field('destinatario.nombre', 'Nombre del destinatario', 'text', true),
      field('destinatario.cargo', 'Cargo del destinatario', 'text', true),
      field('documento.asunto', 'Asunto', 'text', true),
      field('contenido', 'Contenido del informe', 'richtext', true),
      field('firmante.nombre', 'Nombre del firmante', 'text', true),
      field('firmante.cargo', 'Cargo del firmante', 'text', true),
    ],
    bodyHtml: `
${watermark}
<div class="doc">
  {{> institutionHeader}}
  <div class="doc-title">INFORME</div>
  <div class="meta"><span>{{documento.fecha}}</span><span>{{documento.numero}}</span></div>
  <div class="recipient">
    <div>{{destinatario.nombre}}</div>
    <div>{{destinatario.cargo}}</div>
  </div>
  <div class="subject"><strong>Asunto:</strong> {{documento.asunto}}</div>
  <div class="content">{{{contenido}}}</div>
  ${signature}
</div>`,
  },
];

async function seedActaEntrega(
  prisma: PrismaClient,
  adminId: string,
  categoryId: number,
): Promise<void> {
  const existing = await prisma.documentTemplate.findFirst({
    where: { name: 'Acta de entrega-recepción', catalog: 'institutional' },
    select: { id: true },
  });
  if (existing) return;

  const documentType = await prisma.documentType.findFirst({
    where: { name: 'Acta de Entrega de Bienes', isActive: true },
    select: { id: true },
  });

  const template = await prisma.documentTemplate.create({
    data: {
      name: 'Acta de entrega-recepción',
      description:
        'Acta para entrega y recepción de bienes del Consejo Ejecutivo.',
      categoryId,
      documentTypeId: documentType?.id ?? null,
      fields: ACTA_EXACT_FIELDS as any,
      htmlTemplate: ACTA_EXACT_BODY_HTML,
      styles: '',
      outputFormat: 'pdf',
      pageSize: 'Letter',
      orientation: 'portrait',
      isActive: true,
      isPredefined: true,
      catalog: 'institutional',
      createdById: adminId,
    },
  });

  await prisma.documentTemplateVersion.create({
    data: {
      templateId: template.id,
      version: 1,
      status: TemplateVersionStatus.PUBLISHED,
      bodyHtml: ACTA_EXACT_BODY_HTML,
      styles: '',
      marginTop: '0',
      marginBottom: '0',
      marginLeft: '0',
      marginRight: '0',
      pageSize: 'Letter',
      orientation: 'portrait',
      numberPrefix: 'ACT',
      pageFrame: ACTA_EXACT_PAGE_FRAME as any,
      signatures: null,
      fields: ACTA_EXACT_FIELDS as any,
      createdById: adminId,
      publishedAt: new Date(),
    },
  });
}

export async function seedAuthoringTemplates(
  prisma: PrismaClient,
  adminId: string,
): Promise<void> {
  const category = await prisma.category.upsert({
    where: { name: 'Documentos Institucionales' },
    update: {
      description: 'Documentos elaborados con plantillas institucionales',
      color: '#0f766e',
      icon: 'FileText',
      requiresCourse: false,
      allowedRoles: Object.values(UserRole) as any,
      prefix: 'INST',
      bypassAcademicYear: true,
    },
    create: {
      name: 'Documentos Institucionales',
      description: 'Documentos elaborados con plantillas institucionales',
      color: '#0f766e',
      icon: 'FileText',
      requiresCourse: false,
      allowedRoles: Object.values(UserRole) as any,
      prefix: 'INST',
      bypassAcademicYear: true,
    },
  });

  const directoryName = 'Documentos Institucionales';
  let directory = await prisma.directory.findFirst({
    where: { name: directoryName, parentId: null },
    select: { id: true },
  });
  if (!directory) {
    directory = await prisma.directory.create({
      data: {
        name: directoryName,
        nameNormalized: directoryName.toLocaleLowerCase(),
        createdById: adminId,
        isPublic: true,
      },
      select: { id: true },
    });
  }
  await prisma.directoryAncestor.upsert({
    where: {
      ancestorId_descendantId: {
        ancestorId: directory.id,
        descendantId: directory.id,
      },
    },
    update: { depth: 0 },
    create: { ancestorId: directory.id, descendantId: directory.id, depth: 0 },
  });

  const documentTypes = await prisma.documentType.findMany({
    select: { id: true, name: true, isDefault: true, isActive: true },
  });
  const typeByName = new Map(
    documentTypes
      .filter((type) => type.isActive)
      .map((type) => [type.name, type.id] as const),
  );
  const defaultType = documentTypes.find(
    (type) => type.isDefault && type.isActive,
  );
  const resolveTypeId = (name?: string) =>
    (name ? typeByName.get(name) : undefined) ?? defaultType?.id ?? null;

  for (const definition of templates) {
    const fields = { fields: definition.fields };
    const template = await prisma.documentTemplate.upsert({
      where: { name: definition.name },
      update: {
        description: definition.description,
        categoryId: category.id,
        documentTypeId: resolveTypeId(definition.documentTypeName),
        fields: fields as any,
        htmlTemplate: definition.bodyHtml,
        styles,
        outputFormat: 'pdf',
        pageSize: 'A4',
        orientation: 'portrait',
        isActive: true,
        isPredefined: true,
        catalog: 'institutional',
      },
      create: {
        name: definition.name,
        description: definition.description,
        categoryId: category.id,
        documentTypeId: resolveTypeId(definition.documentTypeName),
        fields: fields as any,
        htmlTemplate: definition.bodyHtml,
        styles,
        outputFormat: 'pdf',
        pageSize: 'A4',
        orientation: 'portrait',
        isActive: true,
        isPredefined: true,
        catalog: 'institutional',
        createdById: adminId,
      },
    });

    await prisma.documentTemplateVersion.upsert({
      where: { templateId_version: { templateId: template.id, version: 1 } },
      update: {
        status: TemplateVersionStatus.PUBLISHED,
        bodyHtml: definition.bodyHtml,
        styles,
        fields: fields as any,
        pageSize: 'A4',
        orientation: 'portrait',
        numberPrefix: definition.numberPrefix,
        publishedAt: new Date(),
      },
      create: {
        templateId: template.id,
        version: 1,
        status: TemplateVersionStatus.PUBLISHED,
        bodyHtml: definition.bodyHtml,
        styles,
        fields: fields as any,
        pageSize: 'A4',
        orientation: 'portrait',
        numberPrefix: definition.numberPrefix,
        createdById: adminId,
        publishedAt: new Date(),
      },
    });
  }

  await seedActaEntrega(prisma, adminId, category.id);
  await applyActaFrames(prisma, adminId);

  const blankTemplate = await prisma.documentTemplate.upsert({
    where: { name: BLANK_TEMPLATE_NAME },
    update: {
      description: BLANK_TEMPLATE_DESCRIPTION,
      categoryId: category.id,
      documentTypeId: resolveTypeId(),
      fields: BLANK_TEMPLATE_FIELDS as any,
      htmlTemplate: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      outputFormat: 'pdf',
      pageSize: 'A4',
      orientation: 'portrait',
      isActive: true,
      isPredefined: true,
      isBlank: true,
      catalog: 'institutional',
    },
    create: {
      name: BLANK_TEMPLATE_NAME,
      description: BLANK_TEMPLATE_DESCRIPTION,
      categoryId: category.id,
      documentTypeId: resolveTypeId(),
      fields: BLANK_TEMPLATE_FIELDS as any,
      htmlTemplate: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      outputFormat: 'pdf',
      pageSize: 'A4',
      orientation: 'portrait',
      isActive: true,
      isPredefined: true,
      isBlank: true,
      catalog: 'institutional',
      createdById: adminId,
    },
  });

  await prisma.documentTemplateVersion.upsert({
    where: {
      templateId_version: { templateId: blankTemplate.id, version: 1 },
    },
    update: {
      status: TemplateVersionStatus.PUBLISHED,
      bodyHtml: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      headerHtml: BLANK_TEMPLATE_HEADER_HTML,
      footerHtml: BLANK_TEMPLATE_FOOTER_HTML,
      marginTop: BLANK_TEMPLATE_MARGINS.marginTop,
      marginBottom: BLANK_TEMPLATE_MARGINS.marginBottom,
      marginLeft: BLANK_TEMPLATE_MARGINS.marginLeft,
      marginRight: BLANK_TEMPLATE_MARGINS.marginRight,
      pageFrame: null,
      signatures: null,
      fields: BLANK_TEMPLATE_FIELDS as any,
      pageSize: 'A4',
      orientation: 'portrait',
      numberPrefix: BLANK_TEMPLATE_NUMBER_PREFIX,
      publishedAt: new Date(),
    },
    create: {
      templateId: blankTemplate.id,
      version: 1,
      status: TemplateVersionStatus.PUBLISHED,
      bodyHtml: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      headerHtml: BLANK_TEMPLATE_HEADER_HTML,
      footerHtml: BLANK_TEMPLATE_FOOTER_HTML,
      marginTop: BLANK_TEMPLATE_MARGINS.marginTop,
      marginBottom: BLANK_TEMPLATE_MARGINS.marginBottom,
      marginLeft: BLANK_TEMPLATE_MARGINS.marginLeft,
      marginRight: BLANK_TEMPLATE_MARGINS.marginRight,
      pageFrame: null,
      signatures: null,
      fields: BLANK_TEMPLATE_FIELDS as any,
      pageSize: 'A4',
      orientation: 'portrait',
      numberPrefix: BLANK_TEMPLATE_NUMBER_PREFIX,
      createdById: adminId,
      publishedAt: new Date(),
    },
  });

  const institutionalBlankTemplate = await prisma.documentTemplate.upsert({
    where: { name: BLANK_TEMPLATE_INSTITUTIONAL_NAME },
    update: {
      description: BLANK_TEMPLATE_INSTITUTIONAL_DESCRIPTION,
      categoryId: category.id,
      documentTypeId: resolveTypeId(),
      fields: BLANK_TEMPLATE_FIELDS as any,
      htmlTemplate: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      outputFormat: 'pdf',
      pageSize: 'Letter',
      orientation: 'portrait',
      isActive: true,
      isPredefined: true,
      isBlank: true,
      catalog: 'institutional',
    },
    create: {
      name: BLANK_TEMPLATE_INSTITUTIONAL_NAME,
      description: BLANK_TEMPLATE_INSTITUTIONAL_DESCRIPTION,
      categoryId: category.id,
      documentTypeId: resolveTypeId(),
      fields: BLANK_TEMPLATE_FIELDS as any,
      htmlTemplate: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      outputFormat: 'pdf',
      pageSize: 'Letter',
      orientation: 'portrait',
      isActive: true,
      isPredefined: true,
      isBlank: true,
      catalog: 'institutional',
      createdById: adminId,
    },
  });

  await prisma.documentTemplateVersion.upsert({
    where: {
      templateId_version: {
        templateId: institutionalBlankTemplate.id,
        version: 1,
      },
    },
    update: {
      status: TemplateVersionStatus.PUBLISHED,
      bodyHtml: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      headerHtml: null,
      footerHtml: null,
      marginTop: '0',
      marginBottom: '0',
      marginLeft: '0',
      marginRight: '0',
      pageFrame: ACTA_EXACT_PAGE_FRAME as any,
      signatures: null,
      fields: BLANK_TEMPLATE_FIELDS as any,
      pageSize: 'Letter',
      orientation: 'portrait',
      numberPrefix: BLANK_TEMPLATE_NUMBER_PREFIX,
      publishedAt: new Date(),
    },
    create: {
      templateId: institutionalBlankTemplate.id,
      version: 1,
      status: TemplateVersionStatus.PUBLISHED,
      bodyHtml: BLANK_TEMPLATE_BODY_HTML,
      styles: BLANK_TEMPLATE_STYLES,
      headerHtml: null,
      footerHtml: null,
      marginTop: '0',
      marginBottom: '0',
      marginLeft: '0',
      marginRight: '0',
      pageFrame: ACTA_EXACT_PAGE_FRAME as any,
      signatures: null,
      fields: BLANK_TEMPLATE_FIELDS as any,
      pageSize: 'Letter',
      orientation: 'portrait',
      numberPrefix: BLANK_TEMPLATE_NUMBER_PREFIX,
      createdById: adminId,
      publishedAt: new Date(),
    },
  });
}
