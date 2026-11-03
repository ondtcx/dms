import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TemplateVersionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeFields } from './authoring-fields';
import type { AuthoringField } from './authoring.types';
import { AuthoringRendererService } from './authoring-renderer.service';
import {
  CreateAuthoringTemplateDto,
  CreateAuthoringTemplateVersionDto,
  UpdateAuthoringTemplateDto,
} from './dto/authoring.dto';

const TEMPLATE_INCLUDE = {
  versions: { orderBy: { version: 'desc' as const } },
  category: { select: { id: true, name: true } },
  documentType: { select: { id: true, name: true } },
};

@Injectable()
export class AuthoringTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: AuthoringRendererService,
  ) {}

  private normalizePrefix(prefix: string): string {
    const normalized = String(prefix ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(normalized)) {
      throw new BadRequestException(
        'El prefijo debe tener entre 2 y 12 letras o números',
      );
    }
    return normalized;
  }

  private fieldsOf(value: unknown): AuthoringField[] {
    return normalizeFields(value).fields;
  }

  async list(includeDrafts = false) {
    const where: Prisma.DocumentTemplateWhereInput = {
      catalog: 'institutional',
    };
    if (!includeDrafts) {
      where.isActive = true;
      where.versions = { some: { status: TemplateVersionStatus.PUBLISHED } };
    }

    return this.prisma.documentTemplate.findMany({
      where,
      include: {
        ...TEMPLATE_INCLUDE,
        versions: includeDrafts
          ? { orderBy: { version: 'desc' } }
          : {
              where: { status: TemplateVersionStatus.PUBLISHED },
              orderBy: { version: 'desc' },
              take: 1,
            },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: number) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id, catalog: 'institutional' },
      include: TEMPLATE_INCLUDE,
    });
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    return template;
  }

  async getVersion(versionId: number) {
    const version = await this.prisma.documentTemplateVersion.findUnique({
      where: { id: versionId },
      include: { template: true },
    });
    if (!version || version.template.catalog !== 'institutional') {
      throw new NotFoundException('Versión de plantilla no encontrada');
    }
    return version;
  }

  async publishedVersion(templateId: number) {
    const version = await this.prisma.documentTemplateVersion.findFirst({
      where: {
        templateId,
        status: TemplateVersionStatus.PUBLISHED,
        template: { catalog: 'institutional', isActive: true },
      },
      include: { template: true },
      orderBy: { version: 'desc' },
    });
    if (!version) {
      throw new BadRequestException('La plantilla no tiene versión publicada');
    }
    return version;
  }

  async create(dto: CreateAuthoringTemplateDto, userId: string) {
    const fields = this.fieldsOf(dto.fields);
    const numberPrefix = this.normalizePrefix(dto.numberPrefix);
    const bodyHtml = dto.bodyHtml?.trim();
    if (!bodyHtml) throw new BadRequestException('El cuerpo de la plantilla es obligatorio');

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          fields: { fields } as any,
          htmlTemplate: bodyHtml,
          styles: dto.styles || null,
          outputFormat: 'pdf',
          pageSize: dto.pageSize || 'A4',
          orientation: dto.orientation || 'portrait',
          isActive: true,
          isPredefined: false,
          catalog: 'institutional',
          createdById: userId,
        },
      });

      await tx.documentTemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          status: TemplateVersionStatus.DRAFT,
          bodyHtml,
          styles: dto.styles || null,
          fields: { fields } as any,
          pageSize: dto.pageSize || 'A4',
          orientation: dto.orientation || 'portrait',
          numberPrefix,
          createdById: userId,
        },
      });

      return tx.documentTemplate.findUnique({
        where: { id: template.id },
        include: TEMPLATE_INCLUDE,
      });
    });
  }

  async update(id: number, dto: UpdateAuthoringTemplateDto) {
    await this.get(id);
    if (dto.bodyHtml !== undefined || dto.fields !== undefined) {
      throw new BadRequestException(
        'Los cambios de cuerpo o campos requieren una nueva versión',
      );
    }

    return this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
      },
      include: TEMPLATE_INCLUDE,
    });
  }

  async createVersion(
    templateId: number,
    dto: CreateAuthoringTemplateVersionDto,
    userId: string,
  ) {
    const template = await this.get(templateId);
    const latest = template.versions[0];
    if (!latest) throw new NotFoundException('La plantilla no tiene versiones');

    const bodyHtml = (dto.bodyHtml ?? latest.bodyHtml).trim();
    if (!bodyHtml) throw new BadRequestException('El cuerpo de la plantilla es obligatorio');
    const fields = dto.fields !== undefined
      ? this.fieldsOf(dto.fields)
      : this.fieldsOf(latest.fields);
    const numberPrefix = this.normalizePrefix(
      dto.numberPrefix ?? latest.numberPrefix,
    );

    return this.prisma.documentTemplateVersion.create({
      data: {
        templateId,
        version: latest.version + 1,
        status: TemplateVersionStatus.DRAFT,
        bodyHtml,
        styles: dto.styles !== undefined ? dto.styles : latest.styles,
        fields: { fields } as any,
        pageSize: dto.pageSize ?? latest.pageSize,
        orientation: dto.orientation ?? latest.orientation,
        numberPrefix,
        createdById: userId,
      },
    });
  }

  async publish(templateId: number, versionId: number) {
    const version = await this.getVersion(versionId);
    if (version.templateId !== templateId) {
      throw new BadRequestException('La versión no pertenece a la plantilla');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.updateMany({
        where: { templateId, status: TemplateVersionStatus.PUBLISHED },
        data: { status: TemplateVersionStatus.RETIRED },
      });
      const published = await tx.documentTemplateVersion.update({
        where: { id: versionId },
        data: { status: TemplateVersionStatus.PUBLISHED, publishedAt: new Date() },
      });
      await tx.documentTemplate.update({
        where: { id: templateId },
        data: {
          isActive: true,
          htmlTemplate: published.bodyHtml,
          styles: published.styles,
          fields: published.fields as any,
          pageSize: published.pageSize,
          orientation: published.orientation,
        },
      });
      return tx.documentTemplate.findUnique({
        where: { id: templateId },
        include: TEMPLATE_INCLUDE,
      });
    });
  }

  async deactivate(templateId: number) {
    await this.get(templateId);
    return this.prisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.updateMany({
        where: { templateId, status: TemplateVersionStatus.PUBLISHED },
        data: { status: TemplateVersionStatus.RETIRED },
      });
      return tx.documentTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
        include: TEMPLATE_INCLUDE,
      });
    });
  }

  async preview(templateId: number, versionId?: number) {
    const template = await this.get(templateId);
    const version = versionId
      ? await this.getVersion(versionId)
      : template.versions.find(
          (item) => item.status === TemplateVersionStatus.PUBLISHED,
        ) ?? template.versions[0];
    if (!version) throw new NotFoundException('La plantilla no tiene versiones');

    const fields = this.fieldsOf(version.fields);
    const sample = this.renderer.sampleFormData(fields);
    const buffer = await this.renderer.generatePdf(
      { ...version, template: { name: template.name } } as any,
      sample,
      { name: 'Vista previa', role: 'secretario' },
      { draft: true },
    );
    return {
      buffer,
      filename: `preview-${template.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    };
  }
}
