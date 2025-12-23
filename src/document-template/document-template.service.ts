import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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

@Injectable()
export class DocumentTemplateService {
  constructor(
    private prisma: PrismaService,
    private documentGenerator: DocumentGeneratorService,
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
    const { templateId, formData, filename, description, isPublic } =
      createDocumentFromTemplateDto;

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
      },
    });

    return document;
  }
}
