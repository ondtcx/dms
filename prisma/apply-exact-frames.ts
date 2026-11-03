import { PrismaClient, TemplateVersionStatus } from '@prisma/client';
import { ACTA_FRAME_CONFIGS, buildActaFrame } from './acta-frame-variants';

const CONSTANCIA_BODY_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Por el siguiente motivo: ' }],
    },
  ],
};

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const name of Object.keys(ACTA_FRAME_CONFIGS)) {
      const template = await prisma.documentTemplate.findFirst({
        where: { name, catalog: 'institutional' },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
      if (!template) {
        console.log('missing', name);
        continue;
      }
      const latest = template.versions[0];
      if (!latest) continue;
      const config = ACTA_FRAME_CONFIGS[name];
      const latestFrame = latest.pageFrame as any;
      const latestFields = ((latest.fields as any)?.fields ?? []) as any[];
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
      if (already) {
        console.log('already', name, 'v', latest.version);
        continue;
      }
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
      const frame = buildActaFrame(name);
      const nextVersion = latest.version + 1;
      await prisma.documentTemplateVersion.create({
        data: {
          templateId: template.id,
          version: nextVersion,
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
          createdById: latest.createdById,
          publishedAt: new Date(),
        },
      });
      await prisma.documentTemplateVersion.updateMany({
        where: {
          templateId: template.id,
          status: TemplateVersionStatus.PUBLISHED,
          NOT: { version: nextVersion },
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
      console.log(name, 'v', latest.version, '->', nextVersion, 'frame boxes', frame.body.boxes.length);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
