import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentGeneratorService } from './document-generator.service';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { QueryDocumentTemplateDto } from './dto/query-document-template.dto';
import { CreateDocumentFromTemplateDto } from './dto/create-document-from-template.dto';
import { UpdateDocumentFromTemplateDto } from './dto/update-document-from-template.dto';
import { CreateBatchFromTemplateDto } from './dto/create-batch-from-template.dto';
import { UserRole } from '../auth/role.enum';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { ThumbnailService } from '../document/thumbnail.service';
import { DocumentNumberingService } from '../document/document-numbering.service';
import { SettingsService } from '../settings/settings.service';

const TEMPLATE_INCLUDE = {
  category: {
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
      allowedRoles: true,
    },
  },
  documentType: {
    select: { id: true, name: true, categoryId: true },
  },
} as const;

@Injectable()
export class DocumentTemplateService {
  private readonly logger = new Logger(DocumentTemplateService.name);

  constructor(
    private prisma: PrismaService,
    private documentGenerator: DocumentGeneratorService,
    private numberingService: DocumentNumberingService,
    @Inject(forwardRef(() => ThumbnailService))
    private thumbnailService: ThumbnailService,
    private settingsService: SettingsService,
  ) {}

  /**
   * Retorna los IDs de categorías que el rol puede acceder.
   * Vacío = sin restricción (categoría sin allowedRoles).
   */
  private async getAllowedCategoryIds(userRole: UserRole): Promise<number[]> {
    const categories = await this.prisma.category.findMany({
      select: { id: true, allowedRoles: true },
    });
    return categories
      .filter((cat) => {
        const roles = cat.allowedRoles as string[];
        return roles.length === 0 || roles.includes(userRole);
      })
      .map((cat) => cat.id);
  }

  /**
   * Lee la configuración institucional y convierte el logo a base64
   * para que Puppeteer pueda embeber la imagen sin dependencias de red.
   */
  private async getInstitutionMetadata(): Promise<
    Record<string, string | null>
  > {
    try {
      const settings = await this.settingsService.getSettings();
      const institution = settings.institution as any;
      const schoolYear = settings.schoolYear as any;

      let institutionLogo: string | null = null;
      if (institution?.logoPath) {
        // logoPath: "/files/active/settings/logo/logo_XXX.png"
        const relativePath = institution.logoPath.replace('/files/', '');
        const fsPath = path.join(process.cwd(), 'uploads', relativePath);
        if (fs.existsSync(fsPath)) {
          const ext = path.extname(fsPath).toLowerCase().replace('.', '');
          const mimeType =
            ext === 'svg'
              ? 'image/svg+xml'
              : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          const fileBuffer = fs.readFileSync(fsPath);
          institutionLogo = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
        }
      }

      return {
        institutionName: institution?.name || null,
        institutionLogo,
        institutionAddress: institution?.address || null,
        institutionPhone: institution?.phone || null,
        institutionEmail: institution?.email || null,
        institutionWebsite: institution?.website || null,
        schoolYearName: schoolYear?.name || null,
      };
    } catch (error) {
      this.logger.error('Error obteniendo metadatos institucionales:', error);
      return { institutionName: null, institutionLogo: null };
    }
  }

  async create(
    createDocumentTemplateDto: CreateDocumentTemplateDto,
    userId: string,
  ) {
    const template = await this.prisma.documentTemplate.create({
      data: {
        ...createDocumentTemplateDto,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        ...TEMPLATE_INCLUDE,
      },
    });

    return template;
  }

  async findAll(
    query: QueryDocumentTemplateDto,
    userId: string,
    userRole: UserRole,
  ) {
    const {
      search,
      documentTypeId,
      isActive,
      categoryId,
      page = 1,
      limit = 10,
    } = query;

    const where: any = {};

    // Filtrar por rol: admin ve todo; demás usuarios ven sus propias plantillas +
    // plantillas sin categoría (sin restricción) + plantillas de categorías permitidas.
    if (userRole !== UserRole.ADMIN) {
      const allowedCategoryIds = await this.getAllowedCategoryIds(userRole);
      where.AND = [
        { isActive: true },
        {
          OR: [
            { createdById: userId },
            { categoryId: null },
            { categoryId: { in: allowedCategoryIds } },
          ],
        },
      ];
    }

    if (search) {
      const searchCondition = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { documentType: { name: { contains: search, mode: 'insensitive' } } },
        ],
      };
      where.AND = where.AND
        ? [...where.AND, searchCondition]
        : [searchCondition];
    }

    if (documentTypeId !== undefined) {
      where.documentTypeId = documentTypeId;
    }

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      this.prisma.documentTemplate.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true },
          },
          ...TEMPLATE_INCLUDE,
          _count: { select: { documentTemplateData: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.documentTemplate.count({ where }),
    ]);

    return {
      data: templates,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, userId: string, userRole: UserRole) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        ...TEMPLATE_INCLUDE,
        _count: { select: { documentTemplateData: true } },
      },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    // Solo el creador, admin o si está activa pueden ver
    if (
      userRole !== UserRole.ADMIN &&
      template.createdById !== userId &&
      !template.isActive
    ) {
      throw new ForbiddenException('No tienes permiso para ver esta plantilla');
    }

    return template;
  }

  async update(
    id: number,
    updateDocumentTemplateDto: UpdateDocumentTemplateDto,
    userId: string,
    userRole: UserRole,
  ) {
    const template = await this.findOne(id, userId, userRole);

    // Solo el creador o admin pueden actualizar
    if (userRole !== UserRole.ADMIN && template.createdById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar esta plantilla',
      );
    }

    const updatedTemplate = await this.prisma.documentTemplate.update({
      where: { id },
      data: updateDocumentTemplateDto,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        ...TEMPLATE_INCLUDE,
      },
    });

    return updatedTemplate;
  }

  async remove(id: number, userId: string, userRole: UserRole) {
    const template = await this.findOne(id, userId, userRole);

    // Solo el creador o admin pueden eliminar
    if (userRole !== UserRole.ADMIN && template.createdById !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar esta plantilla',
      );
    }

    await this.prisma.documentTemplate.delete({
      where: { id },
    });

    return { message: 'Plantilla eliminada exitosamente' };
  }

  /**
   * Helper privado: genera un archivo desde la plantilla y crea el registro en DB.
   * Usado tanto por createDocumentFromTemplate como por createBatchFromTemplate.
   */
  private async generateAndPersistDocument(
    template: any,
    row: {
      formData: Record<string, any>;
      filename?: string;
      description?: string;
      categoryId?: number | null;
      sectionId?: number | null;
      isPublic?: boolean;
      batchId?: string | null;
    },
    userId: string,
  ) {
    const {
      formData,
      filename,
      description,
      categoryId,
      sectionId,
      isPublic,
      batchId,
    } = row;

    const institutionMeta = await this.getInstitutionMetadata();

    // Validar campos requeridos
    const templateFields = template.fields as any;
    if (templateFields.fields && Array.isArray(templateFields.fields)) {
      const requiredFields = templateFields.fields
        .filter((field: any) => field.required)
        .map((field: any) => field.name);

      const missingFields = requiredFields.filter(
        (fieldName: string) => !formData[fieldName],
      );

      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Faltan campos requeridos: ${missingFields.join(', ')}`,
        );
      }
    }

    // Determinar formato de salida
    const outputFormat = template.outputFormat || 'pdf';
    const fileExtension = outputFormat === 'html' ? 'html' : 'pdf';

    const typeSlug = (template.documentType?.name ?? template.name)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const generatedFilename =
      filename ||
      `${typeSlug}-${new Date().toISOString().split('T')[0]}-${Date.now()}.${fileExtension}`;

    const templateData = {
      ...formData,
      _metadata: {
        generatedAt: new Date().toISOString(),
        generatedDate: new Date().toLocaleDateString('es-ES'),
        generatedTime: new Date().toLocaleTimeString('es-ES'),
        templateName: template.name,
        templateType: template.documentType?.name ?? template.name,
        ...institutionMeta,
      },
    };

    let documentBuffer: Buffer;
    let mimetype: string;

    if (outputFormat === 'html') {
      const htmlContent = await this.documentGenerator.generateHTML({
        htmlTemplate: template.htmlTemplate,
        styles: template.styles,
        data: templateData,
      });
      documentBuffer = Buffer.from(htmlContent, 'utf-8');
      mimetype = 'text/html';
    } else {
      documentBuffer = await this.documentGenerator.generatePDF({
        htmlTemplate: template.htmlTemplate,
        styles: template.styles,
        data: templateData,
        pageSize: template.pageSize as any,
        orientation: template.orientation as any,
        outputFormat: 'pdf',
      });
      mimetype = 'application/pdf';
    }

    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const storedName = `${Date.now()}-${generatedFilename}`;
    const filePath = await this.documentGenerator.saveDocumentToFile(
      documentBuffer,
      storedName,
      uploadsDir,
    );

    const fileStats = fs.statSync(filePath);

    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
      select: { id: true },
    });

    const document = await this.prisma.document.create({
      data: {
        description:
          description || `${template.name} - Generado desde formulario`,
        isPublic: isPublic || false,
        uploadedById: userId,
        categoryId: categoryId || null,
        versions: {
          create: {
            version: 1,
            filename: generatedFilename,
            storedName,
            mimetype,
            size: fileStats.size,
            path: filePath,
            createdById: userId,
            source: 'UPLOAD_INICIAL',
          }
        },
        templateData: {
          create: {
            templateId: template.id,
            formData,
            batchId: batchId || null,
          }
        },
        ...(currentYear ? { academic: { create: { academicYearId: currentYear.id } } } : {}),
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        templateData: {
          select: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    // Regenerar thumbnail en background para garantizar que corresponde al archivo actual
    this.thumbnailService
      .regenerateThumbnail(filePath, document.id, mimetype)
      .catch(() => {});

    // Asignar número institucional en background
    this.numberingService
      .assignNumber(document.id, categoryId ?? null)
      .catch(() => {});

    return document;
  }

  async createDocumentFromTemplate(
    createDocumentFromTemplateDto: CreateDocumentFromTemplateDto,
    userId: string,
    userRole: UserRole,
  ) {
    const { templateId, formData, filename, description, isPublic, sectionId } =
      createDocumentFromTemplateDto;

    this.logger.log(`Creating document from template ID: ${templateId}`);
    this.logger.debug(`Form Data: ${JSON.stringify(formData)}`);

    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    if (!template.isActive) {
      throw new BadRequestException('La plantilla no está activa');
    }

    // Usar el categoryId de la plantilla; validar que el rol tenga acceso
    const effectiveCategoryId = template.categoryId ?? null;
    if (effectiveCategoryId && userRole !== UserRole.ADMIN) {
      const category = await this.prisma.category.findUnique({
        where: { id: effectiveCategoryId },
        select: { allowedRoles: true },
      });
      if (category) {
        const allowed = category.allowedRoles as string[];
        if (allowed.length > 0 && !allowed.includes(userRole)) {
          throw new ForbiddenException(
            'Tu rol no tiene permiso para generar documentos con esta plantilla',
          );
        }
      }
    }

    const document = await this.generateAndPersistDocument(
      template,
      {
        formData,
        filename,
        description,
        isPublic,
        categoryId: effectiveCategoryId,
        sectionId: sectionId ?? null,
      },
      userId,
    );

    await this.incrementUsageCount(templateId);

    return document;
  }

  async createBatchFromTemplate(
    dto: CreateBatchFromTemplateDto,
    userId: string,
    userRole: UserRole,
  ) {
    const { templateId, batchName, rows, sectionId, isPublic } = dto;

    this.logger.log(
      `Creating batch from template ID: ${templateId}, rows: ${rows.length}`,
    );

    // Validar y obtener plantilla
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    if (!template.isActive) {
      throw new BadRequestException('La plantilla no está activa');
    }

    // Usar el categoryId de la plantilla; validar que el rol tenga acceso
    const effectiveCategoryId = template.categoryId ?? null;
    if (effectiveCategoryId && userRole !== UserRole.ADMIN) {
      const category = await this.prisma.category.findUnique({
        where: { id: effectiveCategoryId },
        select: { allowedRoles: true },
      });
      if (category) {
        const allowed = category.allowedRoles as string[];
        if (allowed.length > 0 && !allowed.includes(userRole)) {
          throw new ForbiddenException(
            'Tu rol no tiene permiso para generar documentos con esta plantilla',
          );
        }
      }
    }

    const categoryId = effectiveCategoryId;

    // Nombre del lote
    const resolvedBatchName =
      batchName ||
      `${template.name} - Lote ${new Date().toLocaleDateString('es-ES')}`;

    // Crear registro del lote
    const batch = await this.prisma.documentBatch.create({
      data: {
        name: resolvedBatchName,
        templateId,
        createdById: userId,
        totalCount: rows.length,
      },
    });

    // Generar documentos por fila
    const documents: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const doc = await this.generateAndPersistDocument(
          template,
          {
            formData: row.formData,
            filename: row.filename,
            description: row.description,
            categoryId: categoryId || null,
            sectionId: sectionId || null,
            isPublic: isPublic || false,
            batchId: batch.id,
          },
          userId,
        );
        documents.push(doc);
      } catch (error: any) {
        errors.push(`Fila ${i + 1}: ${error.message || 'Error desconocido'}`);
        this.logger.warn(
          `Batch ${batch.id} row ${i + 1} failed: ${error.message}`,
        );
      }
    }

    if (documents.length === 0) {
      // Eliminar el lote vacío y lanzar error
      await this.prisma.documentBatch.delete({ where: { id: batch.id } });
      throw new BadRequestException(
        `No se pudo generar ningún documento. Errores: ${errors.join('; ')}`,
      );
    }

    // Actualizar totalCount con los éxitos reales
    const updatedBatch = await this.prisma.documentBatch.update({
      where: { id: batch.id },
      data: { totalCount: documents.length },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            documentType: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    await this.incrementUsageCount(templateId);

    return { batch: updatedBatch, documents, errors };
  }

  /**
   * Genera datos de muestra basados en los campos de una plantilla
   */
  private generateSampleData(
    fields: any,
    templateName?: string,
  ): Record<string, any> {
    const sampleData: Record<string, any> = {
      _metadata: {
        templateName: templateName || 'Plantilla',
        generatedDate: new Date().toLocaleDateString('es-ES'),
        generatedTime: new Date().toLocaleTimeString('es-ES'),
      },
    };

    // Agregar datos de ejemplo para cada campo definido en la plantilla
    if (fields && typeof fields === 'object') {
      const fieldsList = (fields as any).fields || [];
      fieldsList.forEach((field: any) => {
        const fieldName = field.name || field.label;

        switch (field.type) {
          case 'text':
            sampleData[fieldName] = `Ejemplo de ${field.label || fieldName}`;
            break;
          case 'textarea':
            sampleData[fieldName] =
              `Este es un texto de ejemplo para el campo "${field.label || fieldName}". Aquí iría el contenido extenso que el usuario ingresaría en este campo.`;
            break;
          case 'number':
            sampleData[fieldName] = '12345';
            break;
          case 'date':
            sampleData[fieldName] = new Date().toLocaleDateString('es-ES');
            break;
          case 'email':
            sampleData[fieldName] = 'ejemplo@correo.com';
            break;
          case 'tel':
            sampleData[fieldName] = '+1234567890';
            break;
          case 'select':
            sampleData[fieldName] = field.options?.[0] || 'Opción 1';
            break;
          case 'checkbox':
            sampleData[fieldName] = 'Sí';
            break;
          default:
            sampleData[fieldName] = `Valor de ejemplo`;
        }
      });
    }

    return sampleData;
  }

  async generatePreview(id: number, userId: string, userRole: UserRole) {
    // Verificar que la plantilla existe y el usuario tiene acceso
    const template = await this.findOne(id, userId, userRole);

    // Generar datos de ejemplo basados en los campos de la plantilla
    const sampleData = this.generateSampleData(template.fields, template.name);
    const institutionMeta = await this.getInstitutionMetadata();
    sampleData._metadata = { ...sampleData._metadata, ...institutionMeta };

    // Generar el PDF usando el mismo servicio que genera documentos reales
    const pdfBuffer = await this.documentGenerator.generatePDF({
      htmlTemplate: template.htmlTemplate,
      styles: template.styles || '',
      data: sampleData,
      pageSize: template.pageSize as any,
      orientation: template.orientation as any,
      outputFormat: 'pdf',
    });

    return {
      buffer: pdfBuffer,
      filename: `preview-${template.name.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    };
  }

  async getTemplateThumbnail(
    id: number,
    userId: string,
    userRole: UserRole,
  ): Promise<string | null> {
    // Verificar que la plantilla existe y el usuario tiene acceso
    const template = await this.findOne(id, userId, userRole);

    // Usar un ID negativo para diferenciar templates de documentos en el sistema de thumbnails
    const thumbnailId = -id; // Negativo para templates, positivo para documentos

    // Verificar si ya existe el thumbnail
    let thumbnailPath = this.thumbnailService.getThumbnailPath(thumbnailId);

    if (thumbnailPath) {
      return thumbnailPath;
    }

    // Generar PDF con datos de muestra y extraer thumbnail del PDF (mismo flujo que documentos)
    try {
      const sampleData = this.generateSampleData(
        template.fields,
        template.name,
      );
      const institutionMeta = await this.getInstitutionMetadata();
      sampleData._metadata = { ...sampleData._metadata, ...institutionMeta };

      // Generar PDF usando el generador existente (usa page.pdf con printBackground: true)
      const pdfBuffer = await this.documentGenerator.generatePDF({
        htmlTemplate: template.htmlTemplate,
        styles: template.styles || '',
        data: sampleData,
      });

      // Guardar PDF en archivo temporal
      const tempDir = path.join('./uploads/temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempPdfPath = path.join(
        tempDir,
        `thumb_tpl_${id}_${Date.now()}.pdf`,
      );
      await fs.promises.writeFile(tempPdfPath, pdfBuffer);

      try {
        // Convertir PDF a thumbnail (misma lógica que funciona para documentos)
        thumbnailPath = await this.thumbnailService.generateThumbnail(
          tempPdfPath,
          thumbnailId,
          'application/pdf',
        );
      } finally {
        await fs.promises.unlink(tempPdfPath).catch(() => {});
      }

      return thumbnailPath;
    } catch (error) {
      this.logger.error(
        `Error generating thumbnail for template ${id}:`,
        error,
      );
      return null;
    }
  }

  // ============ Plantillas Predefinidas ============

  /**
   * Obtener todas las plantillas predefinidas
   */
  async getPredefinedTemplates(categoryId?: number) {
    const where: any = {
      isPredefined: true,
      isActive: true,
    };

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }

    return this.prisma.documentTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        documentTypeId: true,
        documentType: { select: { id: true, name: true } },
        categoryId: true,
        category: { select: { name: true, color: true } },
        description: true,
        previewImageUrl: true,
        usageCount: true,
        fields: true,
        createdAt: true,
      },
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Obtener galería de plantillas organizadas por categoría
   */
  async getGallery() {
    const templates = await this.getPredefinedTemplates();

    // Agrupar por nombre de categoría
    const gallery = templates.reduce(
      (acc, template) => {
        const category = template.category?.name || 'other';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(template);
        return acc;
      },
      {} as Record<string, any[]>,
    );

    return {
      categories: Object.keys(gallery),
      templates: gallery,
      total: templates.length,
    };
  }

  /**
   * Duplicar una plantilla existente
   */
  async duplicate(id: number, userId: string, newName?: string) {
    const original = await this.prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!original) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    // Generar nombre único si no se proporciona
    const baseName = newName || `${original.name} (Copia)`;
    let finalName = baseName;
    let counter = 1;

    // Verificar si el nombre ya existe
    while (
      await this.prisma.documentTemplate.findUnique({
        where: { name: finalName },
      })
    ) {
      finalName = `${baseName} ${counter}`;
      counter++;
    }

    // Crear copia
    const duplicate = await this.prisma.documentTemplate.create({
      data: {
        name: finalName,
        documentTypeId: original.documentTypeId,
        categoryId: original.categoryId,
        description: original.description,
        fields: original.fields,
        htmlTemplate: original.htmlTemplate,
        styles: original.styles,
        outputFormat: original.outputFormat,
        pageSize: original.pageSize,
        orientation: original.orientation,
        isActive: true,
        isPredefined: false, // Las copias no son predefinidas
        previewImageUrl: original.previewImageUrl,
        usageCount: 0, // Resetear contador
        variableSchema: original.variableSchema,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return duplicate;
  }

  /**
   * Obtener plantillas más populares (por usageCount)
   */
  async getPopular(limit: number = 10) {
    return this.prisma.documentTemplate.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        documentTypeId: true,
        documentType: { select: { id: true, name: true } },
        categoryId: true,
        category: { select: { name: true, color: true } },
        description: true,
        previewImageUrl: true,
        usageCount: true,
        isPredefined: true,
      },
      orderBy: {
        usageCount: 'desc',
      },
      take: limit,
    });
  }

  async updateDocumentFromTemplate(
    id: number,
    dto: UpdateDocumentFromTemplateDto,
    userId: string,
    userRole: UserRole,
  ) {
    // 1. Verificar que el documento existe y no está eliminado
    const document = await this.prisma.document.findUnique({
      where: { id, deletedAt: null },
      include: { templateData: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // 2. Verificar ownership: el dueño, admin y director pueden editar
    const canEdit =
      userRole === UserRole.ADMIN ||
      userRole === UserRole.RECTOR ||
      document.uploadedById === userId;
    if (!canEdit) {
      throw new ForbiddenException(
        'No tienes permiso para editar este documento',
      );
    }

    // 3. Verificar que el documento fue creado desde una plantilla
    if (!document.templateData?.templateId) {
      throw new BadRequestException(
        'El documento no fue creado desde una plantilla',
      );
    }

    // 4. Obtener la plantilla
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: document.templateData.templateId },
      include: { documentType: { select: { id: true, name: true } } },
    });

    if (!template) {
      throw new NotFoundException('Plantilla asociada no encontrada');
    }

    if (!template.isActive) {
      throw new BadRequestException('La plantilla asociada no está activa');
    }

    // 5. Validar campos requeridos del formData
    const templateFields = template.fields as any;
    if (templateFields.fields && Array.isArray(templateFields.fields)) {
      const requiredFields = templateFields.fields
        .filter((field: any) => field.required)
        .map((field: any) => field.name);

      const missingFields = requiredFields.filter(
        (fieldName: string) => !dto.formData[fieldName],
      );

      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Faltan campos requeridos: ${missingFields.join(', ')}`,
        );
      }
    }

    // 6. Determinar formato de salida y generar nuevo archivo
    const institutionMeta = await this.getInstitutionMetadata();
    const outputFormat = template.outputFormat || 'pdf';
    const fileExtension = outputFormat === 'html' ? 'html' : 'pdf';

    const typeSlug = (template.documentType?.name ?? template.name)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const baseFilename =
      dto.filename ||
      document.versions[0].filename ||
      `${typeSlug}-${new Date().toISOString().split('T')[0]}.${fileExtension}`;

    const templateData = {
      ...dto.formData,
      _metadata: {
        generatedAt: new Date().toISOString(),
        generatedDate: new Date().toLocaleDateString('es-ES'),
        generatedTime: new Date().toLocaleTimeString('es-ES'),
        templateName: template.name,
        templateType: template.documentType?.name ?? template.name,
        ...institutionMeta,
      },
    };

    let documentBuffer: Buffer;
    let mimetype: string;

    if (outputFormat === 'html') {
      const htmlContent = await this.documentGenerator.generateHTML({
        htmlTemplate: template.htmlTemplate,
        styles: template.styles,
        data: templateData,
      });
      documentBuffer = Buffer.from(htmlContent, 'utf-8');
      mimetype = 'text/html';
    } else {
      documentBuffer = await this.documentGenerator.generatePDF({
        htmlTemplate: template.htmlTemplate,
        styles: template.styles,
        data: templateData,
        pageSize: template.pageSize as any,
        orientation: template.orientation as any,
        outputFormat: 'pdf',
      });
      mimetype = 'application/pdf';
    }

    // 7. Guardar nuevo archivo en disco
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const newStoredName = `${Date.now()}-${baseFilename}`;
    const newFilePath = await this.documentGenerator.saveDocumentToFile(
      documentBuffer,
      newStoredName,
      uploadsDir,
    );
    const fileStats = fs.statSync(newFilePath);

    // 8. Crear registro de versión anterior antes de actualizar
    const newVersion = document.currentVersion + 1;

    await this.prisma.documentVersion.create({
      data: {
        documentId: id,
        version: newVersion,
        filename: dto.filename || document.versions[0].filename,
        storedName: newStoredName,
        mimetype,
        size: fileStats.size,
        path: newFilePath,
        comment: `Versión ${newVersion} (edición por formulario)`,
        createdById: userId,
        source: 'REEMPLAZO_MANUAL',
      },
    });

    // 9. Actualizar documento en BD
    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        currentVersion: newVersion,
        templateData: {
          update: {
            formData: dto.formData,
          }
        },
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        templateData: {
          select: {
            template: {
              select: {
                id: true,
                name: true,
                documentType: { select: { id: true, name: true } },
              },
            },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    });

    // 10. Regenerar thumbnail con el nuevo archivo
    try {
      await this.thumbnailService.regenerateThumbnail(
        newFilePath,
        id,
        mimetype,
      );
    } catch (error) {
      this.logger.error(
        `Error regenerando thumbnail para documento ${id}:`,
        error,
      );
    }

    return updatedDocument;
  }

  /**
   * Incrementar contador de uso de una plantilla
   * Se llama automáticamente cuando se genera un documento desde la plantilla
   */
  async incrementUsageCount(id: number) {
    try {
      await this.prisma.documentTemplate.update({
        where: { id },
        data: {
          usageCount: {
            increment: 1,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Error incrementing usage count for template ${id}:`,
        error,
      );
    }
  }
}
