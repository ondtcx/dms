import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DirectoryService } from '../directory/directory.service';
import { DocumentService } from '../document/document.service';
import { UserRole } from '../auth/role.enum';
import {
  buildDocumentAccessFilter,
  AccessUser,
} from '../auth/utils/document-access.filter';
import { AddComponentDto } from './dto/add-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { UpdateComponentDto } from './dto/update-component.dto';

// Identidad vigente resuelta en la base de datos: el rol del token nunca
// sustituye la comprobación actual de identidad, rol y asignaciones activas.
type CompositionActor = AccessUser;

// Documento con la información mínima para calcular su origen efectivo.
type CompositionOriginDocument = {
  receptionOriginDirectoryId: number | null;
  directoryId?: number | null;
  directory?: { id: number; receptionEnabled: boolean } | null;
};

// Documento bloqueado dentro de la transacción de composición.
type CompositionDocumentRow = {
  id: number;
  uploadedById: string;
  directoryId: number | null;
  receptionOriginDirectoryId: number | null;
  isComposite: boolean;
  deletedAt: Date | null;
  directory: { id: number; receptionEnabled: boolean } | null;
};

// Miembro del grafo de composición con su origen efectivo incluido.
type CompositionMember = {
  childId: number;
  child: CompositionDocumentRow;
};

export interface AuthorizedMergeComponent {
  order: number;
  child: {
    id: number;
    versions: Array<{
      id: number;
      filename: string;
      mimetype: string;
      path: string;
    }>;
    templateData: {
      templateId: number | null;
      formData: unknown;
      template: {
        id: number;
        htmlTemplate: string;
        styles: string | null;
        pageSize: string;
        orientation: string;
      } | null;
    } | null;
  };
}

// Selección inmutable autorizada para el merge: se revalida antes de devolver
// el búfer para que una revocación, admisión o cambio de grafo/versión falle cerrado.
export interface AuthorizedMergeSnapshot {
  parentId: number;
  origin: number | null;
  signature: string;
  components: AuthorizedMergeComponent[];
}

// La versión vigente es siempre la de mayor número; un take sin orden explícito
// no garantiza la última versión de forma determinista.
const PUBLIC_CHILD_SELECT = {
  id: true,
  versions: {
    orderBy: { version: 'desc' as const },
    select: { filename: true, mimetype: true },
    take: 1,
  },
  templateData: { select: { templateId: true } },
  documentNumber: true,
  category: { select: { id: true, name: true, color: true } },
};

@Injectable()
export class DocumentCompositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directoryService: DirectoryService,
    private readonly documentService: DocumentService,
  ) {}

  async getComposition(parentId: number, actorId: string) {
    const actor = await this.resolveActor(this.prisma, actorId);

    // El padre debe estar vivo y ser legible por el actor vigente. La lectura
    // combina la autorización de acceso con el grafo a revelar.
    const doc = await this.prisma.document.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
        ...buildDocumentAccessFilter(actor),
      },
      select: {
        id: true,
        isComposite: true,
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
        directory: { select: { id: true, receptionEnabled: true } },
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
                ...PUBLIC_CHILD_SELECT,
                directoryId: true,
                receptionOriginDirectoryId: true,
                directory: { select: { id: true, receptionEnabled: true } },
              },
            },
          },
        },
        partOf: {
          where: { parent: { deletedAt: null } },
          select: {
            id: true,
            parent: {
              select: {
                id: true,
                versions: {
                  orderBy: { version: 'desc' },
                  select: { filename: true },
                  take: 1,
                },
                documentNumber: true,
                directoryId: true,
                receptionOriginDirectoryId: true,
                directory: { select: { id: true, receptionEnabled: true } },
              },
            },
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException(`Documento ${parentId} no encontrado`);
    }

    const parentOrigin = this.effectiveOrigin(doc);

    // Un grafo con orígenes incompatibles o con documentos no legibles falla
    // cerrado por completo: no se emiten huecos, posiciones ni recuentos parciales.
    for (const component of doc.components ?? []) {
      this.assertOriginPair(parentOrigin, component.child);
      if (
        !(await this.isDocumentReadable(this.prisma, component.child.id, actor))
      ) {
        throw new ForbiddenException(
          'No tienes acceso a un componente relacionado de esta composición',
        );
      }
    }

    for (const link of doc.partOf ?? []) {
      this.assertOriginPair(parentOrigin, link.parent);
      if (!(await this.isDocumentReadable(this.prisma, link.parent.id, actor))) {
        throw new ForbiddenException(
          'No tienes acceso a un componente relacionado de esta composición',
        );
      }
    }

    return doc;
  }

  async addComponent(parentId: number, dto: AddComponentDto, actorId: string) {
    return this.withCompositionTransaction(async (tx) => {
      const actor = await this.resolveActor(tx, actorId);

      // Bloqueos de fila ordenados antes de cualquier comprobación de autoridad.
      await this.lockDocuments(tx, [parentId, dto.childId]);
      const parent = await this.loadDocumentRow(tx, parentId);

      if (dto.childId === parentId) {
        throw new BadRequestException(
          'Un documento no puede ser componente de sí mismo',
        );
      }

      await this.assertParentEdit(tx, parent, actor, actorId);

      const child = await this.loadDocumentRow(tx, dto.childId);
      if (child.isComposite) {
        throw new BadRequestException(
          'No se puede agregar un documento compuesto como componente de otro',
        );
      }

      const parentOrigin = this.effectiveOrigin(parent);
      const members = await this.loadMemberChildren(tx, parentId);
      for (const member of members) {
        this.assertOriginPair(parentOrigin, member.child);
      }
      this.assertOriginPair(parentOrigin, child);

      if (!(await this.isDocumentReadable(tx, child.id, actor))) {
        throw new ForbiddenException(
          'No tienes acceso a un componente de esta composición',
        );
      }

      const maxOrder = await tx.documentCompositionItem.aggregate({
        where: { parentId },
        _max: { order: true },
      });
      const nextOrder = (maxOrder?._max?.order ?? -1) + 1;

      let component;
      try {
        component = await tx.documentCompositionItem.create({
          data: {
            parentId,
            childId: dto.childId,
            order: nextOrder,
            label: dto.label ?? null,
            insertAfterPage: dto.insertAfterPage ?? null,
          },
          include: { child: { select: PUBLIC_CHILD_SELECT } },
        });
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002') {
          throw new ConflictException(
            'Este documento ya es componente de este informe',
          );
        }
        throw err;
      }

      if (!parent.isComposite) {
        await tx.document.update({
          where: { id: parentId },
          data: { isComposite: true },
        });
      }

      return component;
    });
  }

  async removeComponent(parentId: number, childId: number, actorId: string) {
    return this.withCompositionTransaction(async (tx) => {
      const actor = await this.resolveActor(tx, actorId);

      await this.lockDocuments(tx, [parentId, childId]);
      const parent = await this.loadDocumentRow(tx, parentId);
      await this.assertParentEdit(tx, parent, actor, actorId);

      const item = await tx.documentCompositionItem.findUnique({
        where: { parentId_childId: { parentId, childId } },
      });
      if (!item) {
        throw new NotFoundException(
          'Componente no encontrado en este documento',
        );
      }

      const parentOrigin = this.effectiveOrigin(parent);
      const members = await this.loadMemberChildren(tx, parentId);
      for (const member of members) {
        this.assertOriginPair(parentOrigin, member.child);
      }

      if (!(await this.isDocumentReadable(tx, childId, actor))) {
        throw new ForbiddenException(
          'No tienes acceso a un componente de esta composición',
        );
      }

      await tx.documentCompositionItem.delete({
        where: { parentId_childId: { parentId, childId } },
      });

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
    actorId: string,
  ) {
    return this.withCompositionTransaction(async (tx) => {
      const actor = await this.resolveActor(tx, actorId);

      await this.lockDocuments(tx, [parentId, childId]);
      const parent = await this.loadDocumentRow(tx, parentId);
      await this.assertParentEdit(tx, parent, actor, actorId);

      const item = await tx.documentCompositionItem.findUnique({
        where: { parentId_childId: { parentId, childId } },
      });
      if (!item) {
        throw new NotFoundException(
          'Componente no encontrado en este documento',
        );
      }

      const parentOrigin = this.effectiveOrigin(parent);
      const members = await this.loadMemberChildren(tx, parentId);
      for (const member of members) {
        this.assertOriginPair(parentOrigin, member.child);
      }

      if (!(await this.isDocumentReadable(tx, childId, actor))) {
        throw new ForbiddenException(
          'No tienes acceso a un componente de esta composición',
        );
      }

      return tx.documentCompositionItem.update({
        where: { parentId_childId: { parentId, childId } },
        data: {
          label: dto.label,
          insertAfterPage: dto.insertAfterPage,
        },
        include: { child: { select: PUBLIC_CHILD_SELECT } },
      });
    });
  }

  async reorder(parentId: number, dto: ReorderComponentsDto, actorId: string) {
    return this.withCompositionTransaction(async (tx) => {
      const actor = await this.resolveActor(tx, actorId);

      // Conjunto candidato sin bloqueo para calcular el conjunto completo; luego
      // se bloquea padre y miembros en un único orden ascendente global y se
      // relee el grafo bajo bloqueo, fallando cerrado si cambió.
      const candidates = await this.loadMemberChildren(tx, parentId);
      const candidateIds = candidates.map((member) => member.childId);
      await this.lockDocuments(tx, [parentId, ...candidateIds]);

      const parent = await this.loadDocumentRow(tx, parentId);
      await this.assertParentEdit(tx, parent, actor, actorId);

      const members = await this.loadMemberChildren(tx, parentId);
      const memberIds = new Set(members.map((member) => member.childId));
      const candidateSet = new Set(candidateIds);
      const unchanged =
        memberIds.size === candidateSet.size &&
        candidateIds.every((id) => memberIds.has(id));
      if (!unchanged) {
        throw new ConflictException(
          'La composición cambió durante la operación. Vuelve a intentarlo',
        );
      }

      // Los identificadores deben pertenecer a este informe, sin duplicados ni
      // elementos ajenos, para que no se pueda mutar otro grafo.
      const seen = new Set<number>();
      for (const item of dto.items ?? []) {
        if (seen.has(item.childId)) {
          throw new BadRequestException(
            `El documento ${item.childId} está repetido en el reordenamiento`,
          );
        }
        seen.add(item.childId);
        if (!memberIds.has(item.childId)) {
          throw new BadRequestException(
            `Documento ${item.childId} no es componente de este informe`,
          );
        }
      }

      const parentOrigin = this.effectiveOrigin(parent);
      for (const member of members) {
        this.assertOriginPair(parentOrigin, member.child);
      }

      for (const item of dto.items ?? []) {
        if (!(await this.isDocumentReadable(tx, item.childId, actor))) {
          throw new ForbiddenException(
            'No tienes acceso a un componente de esta composición',
          );
        }
      }

      for (const item of dto.items ?? []) {
        await tx.documentCompositionItem.update({
          where: { parentId_childId: { parentId, childId: item.childId } },
          data: { order: item.order },
        });
      }
    });
  }

  // Selección autorizada compartida con el merge: no expone consultas crudas sin
  // actor y falla cerrado si algún componente no es legible o el grafo es incompatible.
  async authorizeMergeSnapshot(
    parentId: number,
    actorId: string,
  ): Promise<AuthorizedMergeSnapshot> {
    const actor = await this.resolveActor(this.prisma, actorId);
    const parent = await this.loadReadableParent(this.prisma, parentId, actor);
    const parentOrigin = this.effectiveOrigin(parent);

    const components = await this.prisma.documentCompositionItem.findMany({
      where: { parentId, child: { deletedAt: null } },
      orderBy: { order: 'asc' },
      select: {
        order: true,
        child: {
          select: {
            id: true,
            directoryId: true,
            receptionOriginDirectoryId: true,
            directory: { select: { id: true, receptionEnabled: true } },
            versions: {
              orderBy: { version: 'desc' },
              select: { id: true, filename: true, mimetype: true, path: true },
              take: 1,
            },
            templateData: {
              select: {
                templateId: true,
                formData: true,
                template: {
                  select: {
                    id: true,
                    htmlTemplate: true,
                    styles: true,
                    pageSize: true,
                    orientation: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (components.length === 0) {
      throw new BadRequestException(
        'El documento compuesto no tiene componentes activos',
      );
    }

    for (const component of components) {
      this.assertOriginPair(parentOrigin, component.child);
      if (
        !(await this.isDocumentReadable(this.prisma, component.child.id, actor))
      ) {
        throw new ForbiddenException(
          'No tienes acceso a un componente de esta composición',
        );
      }
    }

    const authorized = components as unknown as AuthorizedMergeComponent[];
    return {
      parentId,
      origin: parentOrigin,
      signature: this.mergeSignature(parentOrigin, authorized),
      components: authorized,
    };
  }

  // Revalidación final: una revocación, admisión o cambio de grafo/versión
  // durante la generación no puede publicar bytes no autorizados.
  async recheckMergeSnapshot(
    parentId: number,
    actorId: string,
    expectedSignature: string,
  ): Promise<void> {
    const snapshot = await this.authorizeMergeSnapshot(parentId, actorId);
    if (snapshot.signature !== expectedSignature) {
      throw new ConflictException(
        'La composición cambió durante la generación; vuelve a intentarlo',
      );
    }
  }

  // Firma determinista sobre TODAS las entradas que el merge consume (versión,
  // ruta, plantilla y datos del formulario). Solo se devuelve el hash; nunca se
  // registra ni se expone el contenido.
  private mergeSignature(
    parentOrigin: number | null,
    components: AuthorizedMergeComponent[],
  ): string {
    const hash = createHash('sha256');
    hash.update(`origin:${parentOrigin ?? 'none'}\n`);
    for (const component of components) {
      const child = component.child;
      const version = child.versions?.[0] ?? null;
      const templateData = child.templateData ?? null;
      const template = templateData?.template ?? null;
      hash.update(
        JSON.stringify({
          id: child.id,
          version: version
            ? {
                id: version.id,
                filename: version.filename,
                mimetype: version.mimetype,
                path: version.path,
              }
            : null,
          templateId: templateData?.templateId ?? null,
          formData: templateData?.formData ?? null,
          template: template
            ? {
                id: template.id,
                htmlTemplate: template.htmlTemplate,
                styles: template.styles,
                pageSize: template.pageSize,
                orientation: template.orientation,
              }
            : null,
        }),
      );
      hash.update('\n');
    }
    return hash.digest('hex');
  }

  private async withCompositionTransaction<T>(
    operation: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034') {
        throw new ConflictException(
          'La composición cambió durante la operación. Vuelve a intentarlo',
        );
      }
      throw error;
    }
  }

  // Identidad vigente desde la base de datos; una identidad ausente o eliminada
  // cierra el acceso por completo.
  private async resolveActor(
    db: Prisma.TransactionClient,
    actorId: string,
  ): Promise<CompositionActor> {
    if (!actorId) throw new UnauthorizedException('Usuario no encontrado');
    const user = await db.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        role: true,
        roleAssignments: {
          where: { role: { isActive: true } },
          select: {
            role: { select: { id: true, key: true, isActive: true } },
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return {
      id: user.id,
      role: user.role as unknown as UserRole,
      assignments: (user.roleAssignments ?? []).map(({ role }) => role),
    };
  }

  // El origen efectivo prioriza la referencia durable de recepción; solo cuando
  // no existe se usa la carpeta actual y únicamente si es una recepción.
  private effectiveOrigin(document: CompositionOriginDocument): number | null {
    if (document.receptionOriginDirectoryId != null) {
      return document.receptionOriginDirectoryId;
    }
    if (document.directory?.receptionEnabled) return document.directory.id;
    return null;
  }

  // Compatibilidad: ambos ordinarios (sin origen) o exactamente el mismo origen.
  private originsCompatible(a: number | null, b: number | null): boolean {
    if (a === null && b === null) return true;
    return a !== null && b !== null && a === b;
  }

  private assertOriginPair(
    parentOrigin: number | null,
    document: CompositionOriginDocument,
  ): void {
    if (!this.originsCompatible(parentOrigin, this.effectiveOrigin(document))) {
      throw new ForbiddenException(
        'La composición mezcla documentos con orígenes de recepción incompatibles',
      );
    }
  }

  // Lectura vigente: el documento debe existir, estar vivo y superar el filtro
  // de acceso actual, incluida la participación de recepción.
  private async isDocumentReadable(
    db: Prisma.TransactionClient,
    documentId: number,
    actor: CompositionActor,
  ): Promise<boolean> {
    const document = await db.document.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        ...buildDocumentAccessFilter(actor),
      },
      select: { id: true },
    });
    return Boolean(document);
  }

  private async loadReadableParent(
    db: Prisma.TransactionClient,
    parentId: number,
    actor: CompositionActor,
  ): Promise<CompositionDocumentRow> {
    const parent = await db.document.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
        ...buildDocumentAccessFilter(actor),
      },
      select: {
        id: true,
        isComposite: true,
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
        directory: { select: { id: true, receptionEnabled: true } },
      },
    });
    if (!parent) {
      throw new NotFoundException(`Documento ${parentId} no encontrado`);
    }
    return parent as unknown as CompositionDocumentRow;
  }

  private async loadDocumentRow(
    db: Prisma.TransactionClient,
    id: number,
  ): Promise<CompositionDocumentRow> {
    const document = await db.document.findUnique({
      where: { id },
      select: {
        id: true,
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
        isComposite: true,
        deletedAt: true,
        directory: { select: { id: true, receptionEnabled: true } },
      },
    });
    if (!document || document.deletedAt) {
      throw new NotFoundException(`Documento ${id} no encontrado`);
    }
    return document as unknown as CompositionDocumentRow;
  }

  private async loadMemberChildren(
    db: Prisma.TransactionClient,
    parentId: number,
  ): Promise<CompositionMember[]> {
    const items = await db.documentCompositionItem.findMany({
      where: { parentId },
      select: {
        childId: true,
        child: {
          select: {
            id: true,
            uploadedById: true,
            directoryId: true,
            receptionOriginDirectoryId: true,
            isComposite: true,
            deletedAt: true,
            directory: { select: { id: true, receptionEnabled: true } },
          },
        },
      },
    });
    return items as unknown as CompositionMember[];
  }

  // Autoridad de edición del padre. En recepción solo el autor inmutable y
  // participante vigente puede escribir (sin privilegio de admin/revisor); en
  // carpetas ordinarias se conserva la semántica existente de canEditDocument.
  private async assertParentEdit(
    tx: Prisma.TransactionClient,
    parent: CompositionDocumentRow,
    actor: CompositionActor,
    actorId: string,
  ): Promise<void> {
    if (this.effectiveOrigin(parent) !== null) {
      await this.directoryService.assertDocumentMutation(
        tx,
        parent,
        actorId,
        'edit',
      );
      return;
    }

    const allowed = await this.documentService.canEditDocument(
      { id: parent.id, uploadedById: parent.uploadedById },
      actorId,
      actor.role,
      tx,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'No tienes permiso para modificar la composición de este documento',
      );
    }
  }

  // Bloqueo de filas de documento en orden estable para evitar interbloqueos.
  private async lockDocuments(
    db: Prisma.TransactionClient,
    ids: number[],
  ): Promise<void> {
    const unique = [...new Set(ids)]
      .filter((id) => Number.isInteger(id))
      .sort((a, b) => a - b);
    for (const id of unique) {
      await db.$queryRaw(
        Prisma.sql`SELECT id FROM "Document" WHERE id = ${id} FOR UPDATE`,
      );
    }
  }
}
