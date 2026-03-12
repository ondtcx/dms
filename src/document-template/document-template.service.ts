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
import { UserRole } from '../auth/role.enum';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { ThumbnailService } from '../document/thumbnail.service';

@Injectable()
export class DocumentTemplateService {
  private readonly logger = new Logger(DocumentTemplateService.name);

  constructor(
    private prisma: PrismaService,
    private documentGenerator: DocumentGeneratorService,
    @Inject(forwardRef(() => ThumbnailService))
    private thumbnailService: ThumbnailService,
  ) {}

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
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return template;
  }

  async findAll(query: QueryDocumentTemplateDto, userId: string, userRole: UserRole) {
    const { search, type, isActive, page = 1, limit = 10 } = query;

    const where: any = {};

    // Solo admin puede ver todas las plantillas, usuarios normales solo las suyas y las activas
    if (userRole !== UserRole.ADMIN) {
      where.OR = [
        { createdById: userId },
        { isActive: true },
      ];
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) {
      where.type = type;
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
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              documents: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
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
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            documents: true,
          },
        },
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
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

  async getTemplateTypes(userId: string, userRole: UserRole) {
    const where: any = {};

    if (userRole !== UserRole.ADMIN) {
      where.OR = [
        { createdById: userId },
        { isActive: true },
      ];
    }

    const types = await this.prisma.documentTemplate.groupBy({
      by: ['type'],
      where,
      _count: {
        type: true,
      },
    });

    return types.map((item) => ({
      type: item.type,
      count: item._count.type,
    }));
  }

  async createDocumentFromTemplate(
    createDocumentFromTemplateDto: CreateDocumentFromTemplateDto,
    userId: string,
  ) {
    const { templateId, formData, filename, description, isPublic, categoryId } =
      createDocumentFromTemplateDto;

    this.logger.log(`Creating document from template ID: ${templateId}`);
    this.logger.debug(`Form Data: ${JSON.stringify(formData)}`);

    // Obtener la plantilla
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }

    if (!template.isActive) {
      throw new BadRequestException('La plantilla no está activa');
    }

    // Validar que los campos del formulario coincidan con la definición de la plantilla
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

    // Determinar el formato de salida
    const outputFormat = template.outputFormat || 'pdf';
    const fileExtension = outputFormat === 'html' ? 'html' : 'pdf';

    // Generar nombre de archivo si no se proporcionó
    const generatedFilename =
      filename ||
      `${template.type}-${new Date().toISOString().split('T')[0]}-${Date.now()}.${fileExtension}`;

    // Preparar datos para la plantilla (agregar metadata útil)
    const templateData = {
      ...formData,
      _metadata: {
        generatedAt: new Date().toISOString(),
        generatedDate: new Date().toLocaleDateString('es-ES'),
        generatedTime: new Date().toLocaleTimeString('es-ES'),
        templateName: template.name,
        templateType: template.type,
      },
    };

    this.logger.debug(`Template Data: ${JSON.stringify(templateData)}`);

    // Generar el documento según el formato
    let documentBuffer: Buffer;
    let mimetype: string;

    if (outputFormat === 'html') {
      // Generar HTML
      const htmlContent = await this.documentGenerator.generateHTML({
        htmlTemplate: template.htmlTemplate,
        styles: template.styles,
        data: templateData,
      });

      documentBuffer = Buffer.from(htmlContent, 'utf-8');
      mimetype = 'text/html';
    } else {
      // Generar PDF (por defecto)
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

    // Guardar el archivo
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

    // Crear el documento en la base de datos
    const document = await this.prisma.document.create({
      data: {
        filename: generatedFilename,
        storedName,
        mimetype,
        size: fileStats.size,
        path: filePath,
        description:
          description || `${template.name} - Generado desde formulario`,
        isPublic: isPublic || false,
        uploadedById: userId,
        templateId: template.id,
        formData,
        categoryId: categoryId || null,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            type: true,
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

    return document;
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
            sampleData[fieldName] = `Este es un texto de ejemplo para el campo "${field.label || fieldName}". Aquí iría el contenido extenso que el usuario ingresaría en este campo.`;
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

    // Si no existe, generar el thumbnail desde HTML directamente (más eficiente y compatible)
    try {
      // Generar datos de muestra
      const sampleData = this.generateSampleData(
        template.fields,
        template.name,
      );

      // Compilar el HTML con los datos de muestra
      const compiledHtml = Handlebars.compile(template.htmlTemplate)(
        sampleData,
      );

      // Construir el HTML completo con estilos (usando método privado del generator)
      const fullHtml = this.documentGenerator['generateHtmlWithStyles'](
        compiledHtml,
        template.styles || '',
      );

      // Generar thumbnail desde HTML usando Puppeteer
      thumbnailPath = await this.thumbnailService.generateThumbnailFromHtml(
        fullHtml,
        thumbnailId,
      );

      return thumbnailPath;
    } catch (error) {
      this.logger.error(`Error generating thumbnail for template ${id}:`, error);
      return null;
    }
  }

  // ============ Plantillas Predefinidas ============

  /**
   * Obtener todas las plantillas predefinidas
   */
  async getPredefinedTemplates(category?: string) {
    const where: any = {
      isPredefined: true,
      isActive: true,
    };

    if (category) {
      where.category = category;
    }

    return this.prisma.documentTemplate.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        category: true,
        description: true,
        previewImageUrl: true,
        usageCount: true,
        fields: true,
        createdAt: true,
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Obtener galería de plantillas organizadas por categoría
   */
  async getGallery() {
    const templates = await this.getPredefinedTemplates();

    // Agrupar por categoría
    const gallery = templates.reduce((acc, template) => {
      const category = template.category || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      categories: ['academic', 'administrative', 'legal'],
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
    while (await this.prisma.documentTemplate.findUnique({ where: { name: finalName } })) {
      finalName = `${baseName} ${counter}`;
      counter++;
    }

    // Crear copia
    const duplicate = await this.prisma.documentTemplate.create({
      data: {
        name: finalName,
        type: original.type,
        category: original.category,
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
        type: true,
        category: true,
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
      this.logger.error(`Error incrementing usage count for template ${id}:`, error);
    }
  }
}
