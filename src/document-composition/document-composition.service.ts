import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddComponentDto } from './dto/add-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

@Injectable()
export class DocumentCompositionService {
  constructor(private readonly prisma: PrismaService) {}

  async getComposition(parentId: number) {
    const doc = await this.prisma.document.findUnique({
      where: { id: parentId, deletedAt: null },
      select: {
        id: true,
        isComposite: true,
        components: {
          where: { child: { deletedAt: null } },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            parentId: true,
            childId: true,
            order: true,
            label: true,
            insertAfterPage: true,
            createdAt: true,
            updatedAt: true,
            child: {
              select: {
                id: true,
                versions: { select: { filename: true, mimetype: true }, take: 1 },
                templateData: { select: { templateId: true } },
                documentNumber: true,
                category: { select: { id: true, name: true, color: true } },
              },
            },
          },
        },
        partOf: {
          where: { parent: { deletedAt: null } },
          select: {
            id: true,
            parent: {
              select: { id: true, versions: { select: { filename: true }, take: 1 }, documentNumber: true },
            },
          },
        },
      },
    });

    if (!doc)
      throw new NotFoundException(`Documento ${parentId} no encontrado`);
    return doc;
  }

  async addComponent(parentId: number, dto: AddComponentDto) {
    // Validar que el padre existe
    const parent = await this.prisma.document.findUnique({
      where: { id: parentId, deletedAt: null },
      select: { id: true, isComposite: true },
    });
    if (!parent)
      throw new NotFoundException(`Documento padre ${parentId} no encontrado`);

    // Validar que no se agrega a sí mismo
    if (dto.childId === parentId) {
      throw new BadRequestException(
        'Un documento no puede ser componente de sí mismo',
      );
    }

    // Validar que el hijo existe y no es compuesto
    const child = await this.prisma.document.findUnique({
      where: { id: dto.childId, deletedAt: null },
      select: { id: true, isComposite: true },
    });
    if (!child)
      throw new NotFoundException(
        `Documento hijo ${dto.childId} no encontrado`,
      );
    if (child.isComposite) {
      throw new BadRequestException(
        'No se puede agregar un documento compuesto como componente de otro',
      );
    }

    // Calcular el siguiente orden
    const maxOrder = await this.prisma.documentCompositionItem.aggregate({
      where: { parentId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    // Crear el componente (la constraint @@unique lanzará ConflictException si ya existe)
    let component;
    try {
      component = await this.prisma.$transaction(async (tx) => {
        const item = await tx.documentCompositionItem.create({
          data: {
            parentId,
            childId: dto.childId,
            order: nextOrder,
            label: dto.label ?? null,
            insertAfterPage: dto.insertAfterPage ?? null,
          },
          include: {
            child: {
              select: {
                id: true,
                versions: { select: { filename: true, mimetype: true }, take: 1 },
                templateData: { select: { templateId: true } },
                documentNumber: true,
                category: { select: { id: true, name: true, color: true } },
              },
            },
          },
        });

        // Activar isComposite en el padre si no lo estaba
        if (!parent.isComposite) {
          await tx.document.update({
            where: { id: parentId },
            data: { isComposite: true },
          });
        }

        return item;
      });
    } catch (err) {
      if (err.code === 'P2002') {
        throw new ConflictException(
          'Este documento ya es componente de este informe',
        );
      }
      throw err;
    }

    return component;
  }

  async removeComponent(parentId: number, childId: number) {
    const item = await this.prisma.documentCompositionItem.findUnique({
      where: { parentId_childId: { parentId, childId } },
    });
    if (!item)
      throw new NotFoundException('Componente no encontrado en este documento');

    await this.prisma.$transaction(async (tx) => {
      await tx.documentCompositionItem.delete({
        where: { parentId_childId: { parentId, childId } },
      });

      // Si ya no quedan componentes, desactivar isComposite
      const remaining = await tx.documentCompositionItem.count({
        where: { parentId },
      });
      if (remaining === 0) {
        await tx.document.update({
          where: { id: parentId },
          data: { isComposite: false },
        });
      }
    });
  }

  async updateComponent(
    parentId: number,
    childId: number,
    dto: UpdateComponentDto,
  ) {
    const item = await this.prisma.documentCompositionItem.findUnique({
      where: { parentId_childId: { parentId, childId } },
    });
    if (!item)
      throw new NotFoundException('Componente no encontrado en este documento');

    return this.prisma.documentCompositionItem.update({
      where: { parentId_childId: { parentId, childId } },
      data: {
        label: dto.label,
        insertAfterPage: dto.insertAfterPage,
      },
      include: {
        child: {
          select: {
            id: true,
            versions: { select: { filename: true, mimetype: true }, take: 1 },
            templateData: { select: { templateId: true } },
            documentNumber: true,
            category: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
  }

  async reorder(parentId: number, dto: ReorderComponentsDto) {
    // Verificar que todos los childIds pertenecen al padre
    const existing = await this.prisma.documentCompositionItem.findMany({
      where: { parentId },
      select: { childId: true },
    });
    const existingIds = new Set(existing.map((e) => e.childId));

    for (const item of dto.items) {
      if (!existingIds.has(item.childId)) {
        throw new BadRequestException(
          `Documento ${item.childId} no es componente de este informe`,
        );
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.documentCompositionItem.update({
          where: { parentId_childId: { parentId, childId: item.childId } },
          data: { order: item.order },
        }),
      ),
    );
  }
}
