import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentGeneratorService } from './document-generator.service';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { QueryDocumentTemplateDto } from './dto/query-document-template.dto';
import { CreateDocumentFromTemplateDto } from './dto/create-document-from-template.dto';
import { UpdateDocumentFromTemplateDto } from './dto/update-document-from-template.dto';
import { CreateBatchFromTemplateDto } from './dto/create-batch-from-template.dto';
import { sharingManagerSelect, assertSharingManager, assertSharingDocumentAvailable } from '../auth/utils/document-sharing.policy';
import { UserRole } from '../auth/role.enum';
import { Prisma, WorkflowStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DirectoryService } from '../directory/directory.service';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { ThumbnailService } from '../document/thumbnail.service';
import {
  DocumentPageCountService,
  type PageCountTarget,
} from '../document/document-page-count.service';
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
    private directoryService: DirectoryService,
    // Metadato derivado del recuento de páginas. La inyección es opcional para
    // que los constructores directos sigan compilando; el módulo siempre lo provee.
    @Optional() private readonly pageCountService?: DocumentPageCountService,
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
    const { documentTypeId, categoryId } = createDocumentTemplateDto;
    // El tipo genérico es la ausencia de tipo concreto: null u omitido.
    const documentType =
      documentTypeId === undefined || documentTypeId === null
        ? null
        : await this.prisma.documentType.findUnique({
            where: { id: documentTypeId },
            select: { id: true, isActive: true, categoryId: true },
          });

    if (
      documentTypeId !== undefined &&
      documentTypeId !== null &&
      !documentType
    ) {
      throw new BadRequestException('El tipo de documento no existe');
    }
    if (documentType && !documentType.isActive) {
      throw new BadRequestException('El tipo de documento está inactivo');
    }
    if (
      documentType &&
      categoryId !== undefined &&
      categoryId !== documentType.categoryId
    ) {
      throw new BadRequestException(
        'La categoría indicada no corresponde al tipo de documento seleccionado',
      );
    }

    const template = await this.prisma.documentTemplate.create({
      data: {
        ...createDocumentTemplateDto,
        documentTypeId: documentType?.id ?? null,
        categoryId: categoryId ?? documentType?.categoryId ?? null,
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

  // Valida y resuelve el par categoría/tipo en una actualización parcial de
  // plantilla con la misma semántica que la creación: un tipo concreto exige
  // existencia y actividad y deriva su categoría; `null` limpia al genérico;
  // un cambio solo de categoría no puede invalidar un tipo concreto existente.
  private async resolveUpdateClassification(
    template: { documentTypeId?: number | null; categoryId?: number | null },
    updateDocumentTemplateDto: UpdateDocumentTemplateDto,
  ): Promise<{ documentTypeId?: number | null; categoryId?: number | null }> {
    const typeProvided = updateDocumentTemplateDto.documentTypeId !== undefined;
    const categoryProvided =
      updateDocumentTemplateDto.categoryId !== undefined;

    if (typeProvided && updateDocumentTemplateDto.documentTypeId !== null) {
      const documentType = await this.prisma.documentType.findUnique({
        where: { id: updateDocumentTemplateDto.documentTypeId },
        select: { id: true, isActive: true, categoryId: true },
      });
      if (!documentType) {
        throw new BadRequestException('El tipo de documento no existe');
      }
      if (!documentType.isActive) {
        throw new BadRequestException('El tipo de documento está inactivo');
      }
      if (
        categoryProvided &&
        updateDocumentTemplateDto.categoryId !== documentType.categoryId
      ) {
        throw new BadRequestException(
          'La categoría indicada no corresponde al tipo de documento seleccionado',
        );
      }
      return {
        documentTypeId: documentType.id,
        categoryId: documentType.categoryId,
      };
    }

    if (typeProvided) {
      return {
        documentTypeId: null,
        ...(categoryProvided
          ? { categoryId: updateDocumentTemplateDto.categoryId }
          : {}),
      };
    }

    if (categoryProvided) {
      const existingTypeId = template.documentTypeId ?? null;
      if (existingTypeId !== null) {
        const existingType = await this.prisma.documentType.findUnique({
          where: { id: existingTypeId },
          select: { id: true, isActive: true, categoryId: true },
        });
        if (
          existingType &&
          existingType.categoryId !== updateDocumentTemplateDto.categoryId
        ) {
          throw new BadRequestException(
            'La categoría indicada no corresponde al tipo de documento seleccionado',
          );
        }
      }
      return { categoryId: updateDocumentTemplateDto.categoryId };
    }

    return {};
  }

  async update(
    id: number,
    updateDocumentTemplateDto: UpdateDocumentTemplateDto,
    userId: string,
    userRole: UserRole,
  ) {
    const template = await this.findOne(id, userId, userRole);
    const classification = await this.resolveUpdateClassification(
      template,
      updateDocumentTemplateDto,
    );

    const updatedTemplate = await this.prisma.documentTemplate.update({
      where: { id },
      data: {
        ...updateDocumentTemplateDto,
        documentTypeId: classification.documentTypeId,
        ...(classification.categoryId !== undefined
          ? { categoryId: classification.categoryId }
          : {}),
      },
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

    const resolvedCategoryId =
      categoryId ?? template.documentType?.categoryId ?? null;

    const document = await this.prisma.document.create({
      data: {
        description:
          description || `${template.name} - Generado desde formulario`,
        isPublic: isPublic || false,
         uploadedById: userId,
         directoryId: null,
         categoryId: resolvedCategoryId,
         documentTypeId: template.documentTypeId || null,
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
        documentType: { select: { id: true, name: true } },
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
    const { templateId, formData, filename, description, isPublic } =
      createDocumentFromTemplateDto;

    this.logger.log(`Creating document from template ID: ${templateId}`);
    this.logger.debug(`Form Data: ${JSON.stringify(formData)}`);

    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
      include: { documentType: { select: { id: true, name: true, categoryId: true } } },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    if (!template.isActive) {
      throw new BadRequestException('La plantilla no está activa');
    }

    // Usar el categoryId de la plantilla; validar que el rol tenga acceso
    const effectiveCategoryId =
      template.categoryId ?? template.documentType?.categoryId ?? null;
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
    const { templateId, batchName, rows, isPublic } = dto;

    this.logger.log(
      `Creating batch from template ID: ${templateId}, rows: ${rows.length}`,
    );

    // Validar y obtener plantilla
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
      include: { documentType: { select: { id: true, name: true, categoryId: true } } },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    if (!template.isActive) {
      throw new BadRequestException('La plantilla no está activa');
    }

    // Usar el categoryId de la plantilla; validar que el rol tenga acceso
    const effectiveCategoryId =
      template.categoryId ?? template.documentType?.categoryId ?? null;
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

  private async assertTemplateMutation(
    db: Prisma.TransactionClient,
    document: Prisma.DocumentGetPayload<{ include: { directory: { select: { receptionEnabled: true } } } }>,
    dto: UpdateDocumentFromTemplateDto, userId: string, userRole: UserRole,
  ) {
    await assertSharingDocumentAvailable(db, document);
    const reception = await this.directoryService.assertDocumentMutation(db, document, userId, 'edit');
    if (!reception && ![UserRole.ADMIN, UserRole.RECTOR].includes(userRole) && document.uploadedById !== userId)
      throw new ForbiddenException('No tienes permiso para editar este documento');
    if (dto.isPublic !== undefined && dto.isPublic !== document.isPublic) {
      const manager = await db.user.findUnique({ where: { id: userId }, select: sharingManagerSelect });
      assertSharingManager(document, manager);
    }
    if (!reception) return;
    const workflow = await db.documentWorkflow.findFirst({ where: {
      documentId: document.id, active: true,
      status: { in: [WorkflowStatus.PENDING, WorkflowStatus.IN_PROGRESS, WorkflowStatus.CHANGES_REQUESTED] },
    }, select: { status: true, initiatedById: true } });
    if (workflow && !(workflow.status === WorkflowStatus.CHANGES_REQUESTED && workflow.initiatedById === userId))
      throw new ForbiddenException('No se puede editar un documento con un workflow activo');
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
      include: { templateData: true, versions: { orderBy: { version: 'desc' }, take: 1 }, directory: { select: { receptionEnabled: true } } },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Revalidar antes de generar bytes; esta comprobación no autoriza la escritura final.
    await this.assertTemplateMutation(this.prisma, document, dto, userId, userRole);
    if (!document.versions[0]) throw new NotFoundException('Versión actual no encontrada');

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

    // Guardar solo después del bloqueo y la autorización vigente; un fallo de
    // persistencia elimina únicamente la ruta independiente de esta operación.
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const newStoredName = `${randomUUID()}.${fileExtension}`;
    let newFilePath: string | null = null;
    let pageCountTarget: PageCountTarget | null = null;
    let updatedDocument: any;
    try {
      updatedDocument = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`;
        const locked = await tx.document.findUnique({ where: { id }, include: {
          templateData: true, versions: { orderBy: { version: 'desc' }, take: 1 }, directory: { select: { receptionEnabled: true } },
        } });
        if (!locked) throw new NotFoundException('Documento no encontrado');
        await this.assertTemplateMutation(tx, locked, dto, userId, userRole);
        if (locked.currentVersion !== document.currentVersion || locked.versions[0]?.id !== document.versions[0].id ||
          locked.templateData?.templateId !== document.templateData?.templateId)
          throw new ConflictException('El documento cambió durante la generación. Vuelve a intentarlo');
        const destination = path.join(uploadsDir, newStoredName);
        if (locked.versions.some(version => path.resolve(version.path) === path.resolve(destination)) || fs.existsSync(destination))
          throw new ConflictException('La ruta de destino ya está en uso');
        newFilePath = destination;
        await this.documentGenerator.saveDocumentToFile(documentBuffer, newStoredName, uploadsDir);
        const fileStats = fs.statSync(newFilePath);
        const newVersion = locked.currentVersion + 1;
        await tx.documentVersion.update({ where: { id: locked.versions[0].id }, data: { supersededAt: new Date() } });
        const workflow = await tx.documentWorkflow.findFirst({ where: {
          documentId: id, active: true, status: WorkflowStatus.CHANGES_REQUESTED,
        }, select: { id: true } });
        const version = await tx.documentVersion.create({
          data: {
            documentId: id,
            version: newVersion,
            filename: dto.filename || locked.versions[0].filename || baseFilename,
            storedName: newStoredName,
            mimetype,
            size: fileStats.size,
            path: newFilePath,
            comment: `Versión ${newVersion} (edición por formulario)`,
            createdById: userId,
            source: workflow ? 'CAMBIOS_SOLICITADOS' : 'REEMPLAZO_MANUAL',
            workflowId: workflow?.id ?? null,
          },
        });
        pageCountTarget = { id: version.id, path: version.path, mimetype: version.mimetype };
        if (workflow && version?.id) {
          await tx.documentWorkflow.update({ where: { id: workflow.id }, data: { documentVersionId: version.id } });
        }
        const updated = await tx.document.update({
          where: { id },
          data: {
            currentVersion: newVersion,
            templateData: {
              update: {
                formData: dto.formData,
              },
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
        await tx.documentAccess.create({ data: { documentId: id, userId, action: 'UPDATE' } });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      if (newFilePath) {
        try { await fs.promises.unlink(newFilePath); }
        catch { this.logger.error('No se pudo compensar el archivo de plantilla no confirmado'); }
      }
      if ((error as { code?: string })?.code === 'P2034') throw new ConflictException('La autorización cambió durante la operación. Vuelve a intentarlo');
      throw error;
    }

    // Un fallo posterior a la confirmación no elimina el archivo comprometido.
    try {
      await this.thumbnailService.regenerateThumbnail(
        newFilePath!,
        id,
        mimetype,
      );
    } catch (error) {
      this.logger.error(
        `Error regenerando thumbnail para documento ${id}:`,
        error,
      );
    }

    if (pageCountTarget)
      this.pageCountService?.record(pageCountTarget).catch(() => {});

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
