import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { DocumentCompositionService } from './document-composition.service';

// Pruebas aisladas con base y archivos simulados: sin base de datos viva.
function childDoc(id: number, overrides: Record<string, any> = {}) {
  return {
    id,
    uploadedById: 'author',
    directoryId: null,
    receptionOriginDirectoryId: null,
    isComposite: false,
    deletedAt: null,
    directory: null,
    versions: [],
    templateData: null,
    documentNumber: `DOC-${id}`,
    category: null,
    ...overrides,
  };
}

function fixture() {
  // Resultados por id para document.findFirst (lectura autorizada).
  const readable = new Map<number, any>();
  // Resultados por id para document.findUnique (carga de fila bloqueada).
  const rows = new Map<number, any>();
  // Miembros por padre para documentCompositionItem.findMany.
  const members = new Map<number, any[]>();
  // Items existentes por "parentId:childId".
  const items = new Map<string, any>();
  const created: any[] = [];
  const updates: any[] = [];
  const deletes: any[] = [];

  const db: any = {
    user: {
      findUnique: jest.fn(async () => ({
        id: 'author',
        role: 'user',
        roleAssignments: [],
      })),
    },
    document: {
      findFirst: jest.fn(async ({ where }) =>
        readable.has(where.id) ? readable.get(where.id) : null,
      ),
      findUnique: jest.fn(async ({ where }) => rows.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.get(where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    documentCompositionItem: {
      findMany: jest.fn(async ({ where }) => members.get(where.parentId) ?? []),
      findUnique: jest.fn(
        async ({ where }) =>
          items.get(
            `${where.parentId_childId.parentId}:${where.parentId_childId.childId}`,
          ) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        created.push(data);
        return { id: 99, ...data };
      }),
      update: jest.fn(async ({ where, data }) => {
        updates.push({ where, data });
        return { ...where, ...data };
      }),
      delete: jest.fn(async ({ where }) => {
        deletes.push(where);
      }),
      count: jest.fn(async () => 1),
      aggregate: jest.fn(async () => ({ _max: { order: null } })),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  db.$transaction = jest.fn(async (cb: any, options: any) => {
    db.__txOptions = options;
    return cb(db);
  });

  const directoryService: any = { assertDocumentMutation: jest.fn() };
  const documentService: any = { canEditDocument: jest.fn() };
  directoryService.assertDocumentMutation.mockResolvedValue(true);
  documentService.canEditDocument.mockResolvedValue(true);

  const service = new DocumentCompositionService(
    db,
    directoryService,
    documentService,
  );

  return {
    db,
    service,
    directoryService,
    documentService,
    readable,
    rows,
    members,
    items,
    created,
    updates,
    deletes,
  };
}

describe('composition reads propagate the live actor', () => {
  it('rejects a missing or deleted actor before any read', async () => {
    const { db, service } = fixture();
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.getComposition(10, 'ghost')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an actorless direct call', async () => {
    const { service } = fixture();
    await expect(
      service.getComposition(10, undefined as unknown as string),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('requires the parent to be live and readable and applies the access filter', async () => {
    const { db, service } = fixture();
    await expect(service.getComposition(10, 'author')).rejects.toThrow(
      'no encontrado',
    );
    expect(db.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 10,
          deletedAt: null,
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('fails closed when any related component is unreadable, leaking no ids, titles, counts or positions', async () => {
    const { db, service, readable } = fixture();
    const hidden = childDoc(2, { documentNumber: 'SECRET-2' });
    const visible = childDoc(3, { documentNumber: 'VISIBLE-3' });
    readable.set(10, {
      ...childDoc(10),
      isComposite: true,
      components: [
        { childId: 2, child: hidden },
        { childId: 3, child: visible },
      ],
      partOf: [],
    });
    readable.set(3, { id: 3 });

    await expect(service.getComposition(10, 'author')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('fails closed when any related partOf parent is unreadable', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, {
      ...childDoc(10),
      isComposite: false,
      components: [],
      partOf: [
        { id: 1, parent: { id: 7, documentNumber: 'SECRET-7', versions: [] } },
        { id: 2, parent: { id: 8, documentNumber: 'VISIBLE-8', versions: [] } },
      ],
    });
    readable.set(8, { id: 8 });

    await expect(service.getComposition(10, 'author')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('selects the latest version deterministically for metadata reads', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, { ...childDoc(10), components: [], partOf: [] });
    await service.getComposition(10, 'author');
    const select = db.document.findFirst.mock.calls[0][0].select;
    expect(select.components.select.child.select.versions.orderBy).toEqual({
      version: 'desc',
    });
    expect(select.partOf.select.parent.select.versions.orderBy).toEqual({
      version: 'desc',
    });
  });

  it('fails closed when the graph mixes incompatible origins', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, {
      ...childDoc(10, { directoryId: null }),
      isComposite: true,
      components: [
        {
          childId: 2,
          child: childDoc(2, {
            receptionOriginDirectoryId: 2,
            directory: { id: 2, receptionEnabled: true },
          }),
        },
      ],
      partOf: [],
    });
    await expect(service.getComposition(10, 'author')).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('composition writes enforce parent edit and child read', () => {
  it('routes reception parents through the immutable author guard, not canEditDocument', async () => {
    const { db, service, rows, readable, directoryService, documentService } =
      fixture();
    rows.set(
      10,
      childDoc(10, {
        directoryId: 2,
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    rows.set(
      3,
      childDoc(3, {
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    readable.set(3, { id: 3 });

    await service.addComponent(10, { childId: 3 } as any, 'author');

    expect(directoryService.assertDocumentMutation).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: 10, receptionOriginDirectoryId: 2 }),
      'author',
      'edit',
    );
    expect(documentService.canEditDocument).not.toHaveBeenCalled();
  });

  it.each(['peer', 'reviewer', 'admin'])(
    'fails closed when the reception guard rejects a %s',
    async (actor) => {
      const { db, service, rows, directoryService } = fixture();
      rows.set(
        10,
        childDoc(10, {
          directoryId: 2,
          receptionOriginDirectoryId: 2,
          directory: { id: 2, receptionEnabled: true },
        }),
      );
      directoryService.assertDocumentMutation.mockRejectedValue(
        new ForbiddenException('Solo el autor puede modificar su documento'),
      );
      await expect(
        service.addComponent(10, { childId: 3 } as any, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(db.documentCompositionItem.create).not.toHaveBeenCalled();
    },
  );

  it('uses canEditDocument for ordinary parents and the database role', async () => {
    const { db, service, rows, readable, documentService } = fixture();
    db.user.findUnique.mockResolvedValue({
      id: 'author',
      role: 'admin',
      roleAssignments: [],
    });
    rows.set(10, childDoc(10));
    rows.set(3, childDoc(3));
    readable.set(3, { id: 3 });

    await service.addComponent(10, { childId: 3 } as any, 'author');

    expect(documentService.canEditDocument).toHaveBeenCalledWith(
      { id: 10, uploadedById: 'author' },
      'author',
      'admin',
      db,
    );
  });

  it('denies ordinary edits when canEditDocument returns false', async () => {
    const { db, service, rows, documentService } = fixture();
    rows.set(10, childDoc(10));
    documentService.canEditDocument.mockResolvedValue(false);
    await expect(
      service.addComponent(10, { childId: 3 } as any, 'author'),
    ).rejects.toThrow(ForbiddenException);
    expect(db.documentCompositionItem.create).not.toHaveBeenCalled();
  });

  it('requires child read access for the affected graph', async () => {
    const { db, service, rows } = fixture();
    rows.set(10, childDoc(10));
    rows.set(3, childDoc(3));
    // El hijo existe pero no es legible por el actor.
    await expect(
      service.addComponent(10, { childId: 3 } as any, 'author'),
    ).rejects.toThrow(ForbiddenException);
    expect(db.documentCompositionItem.create).not.toHaveBeenCalled();
  });

  it('rejects mixing ordinary and protected documents', async () => {
    const { db, service, rows, readable } = fixture();
    rows.set(10, childDoc(10));
    rows.set(
      3,
      childDoc(3, {
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    readable.set(3, { id: 3 });
    await expect(
      service.addComponent(10, { childId: 3 } as any, 'author'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects distinct protected origins but allows the same origin', async () => {
    const { db, service, rows, readable } = fixture();
    rows.set(
      10,
      childDoc(10, {
        directoryId: 2,
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    rows.set(
      3,
      childDoc(3, {
        receptionOriginDirectoryId: 5,
        directory: { id: 5, receptionEnabled: true },
      }),
    );
    readable.set(3, { id: 3 });
    await expect(
      service.addComponent(10, { childId: 3 } as any, 'author'),
    ).rejects.toThrow(ForbiddenException);

    rows.set(
      4,
      childDoc(4, {
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    readable.set(4, { id: 4 });
    await service.addComponent(10, { childId: 4 } as any, 'author');
    expect(db.documentCompositionItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ childId: 4 }) }),
    );
  });

  it('keeps the durable origin even after the document moved to an ordinary folder', async () => {
    const { service, rows, readable, directoryService } = fixture();
    rows.set(
      10,
      childDoc(10, {
        directoryId: 9,
        receptionOriginDirectoryId: 2,
        directory: { id: 9, receptionEnabled: false },
      }),
    );
    rows.set(
      3,
      childDoc(3, {
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    readable.set(3, { id: 3 });
    await service.addComponent(10, { childId: 3 } as any, 'author');
    expect(directoryService.assertDocumentMutation).toHaveBeenCalled();
  });

  it('preserves self and composite rejection', async () => {
    const { db, service, rows, readable } = fixture();
    rows.set(10, childDoc(10));
    await expect(
      service.addComponent(10, { childId: 10 } as any, 'author'),
    ).rejects.toThrow(BadRequestException);

    rows.set(3, childDoc(3, { isComposite: true }));
    readable.set(3, { id: 3 });
    await expect(
      service.addComponent(10, { childId: 3 } as any, 'author'),
    ).rejects.toThrow(BadRequestException);
  });

  it('activates isComposite on the parent for a first component', async () => {
    const { db, service, rows, readable, created } = fixture();
    rows.set(10, childDoc(10, { isComposite: false }));
    rows.set(3, childDoc(3));
    readable.set(3, { id: 3 });
    await service.addComponent(10, { childId: 3 } as any, 'author');
    expect(created).toHaveLength(1);
    expect(db.document.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { isComposite: true },
    });
  });
});

describe('composition mutation transaction guarantees', () => {
  it('runs mutations in a serializable transaction', async () => {
    const { db, service, rows, readable } = fixture();
    rows.set(10, childDoc(10));
    rows.set(3, childDoc(3));
    readable.set(3, { id: 3 });
    await service.addComponent(10, { childId: 3 } as any, 'author');
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
  });

  it('locks document rows in stable sorted order', async () => {
    const { db, service, rows, readable } = fixture();
    rows.set(10, childDoc(10));
    rows.set(3, childDoc(3));
    readable.set(3, { id: 3 });
    await service.addComponent(10, { childId: 3 } as any, 'author');
    expect(db.$queryRaw.mock.calls.map(([sql]: any[]) => sql.values)).toEqual([
      [3],
      [10],
    ]);
  });

  it('rechecks the guard with the transaction client, not a preflight snapshot', async () => {
    const { db, service, rows, readable, directoryService } = fixture();
    rows.set(
      10,
      childDoc(10, {
        directoryId: 2,
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    rows.set(
      3,
      childDoc(3, {
        receptionOriginDirectoryId: 2,
        directory: { id: 2, receptionEnabled: true },
      }),
    );
    readable.set(3, { id: 3 });
    await service.addComponent(10, { childId: 3 } as any, 'author');
    // El mismo cliente transaccional se pasa al guard, que revalida la vigencia.
    expect(directoryService.assertDocumentMutation.mock.calls[0][0]).toBe(db);
  });

  it('passes the transaction client into the ordinary edit authority check', async () => {
    const { db, service, rows, readable, documentService } = fixture();
    rows.set(10, childDoc(10));
    rows.set(3, childDoc(3));
    readable.set(3, { id: 3 });
    await service.addComponent(10, { childId: 3 } as any, 'author');
    expect(documentService.canEditDocument).toHaveBeenCalledWith(
      { id: 10, uploadedById: 'author' },
      'author',
      'user',
      db,
    );
  });
});

describe('reorder protects the graph boundary', () => {
  it('rejects duplicate and foreign identifiers', async () => {
    const { db, service, rows, members, readable } = fixture();
    rows.set(10, childDoc(10));
    members.set(10, [
      { childId: 3, order: 0, child: childDoc(3) },
      { childId: 4, order: 1, child: childDoc(4) },
    ]);
    readable.set(3, { id: 3 });
    readable.set(4, { id: 4 });

    await expect(
      service.reorder(
        10,
        { items: [{ childId: 3, order: 0 }, { childId: 3, order: 1 }] } as any,
        'author',
      ),
    ).rejects.toThrow('repetido');

    await expect(
      service.reorder(
        10,
        { items: [{ childId: 3, order: 0 }, { childId: 99, order: 1 }] } as any,
        'author',
      ),
    ).rejects.toThrow('no es componente');
    expect(db.documentCompositionItem.update).not.toHaveBeenCalled();
  });

  it('applies a valid reorder inside the transaction', async () => {
    const { db, service, rows, members, readable } = fixture();
    rows.set(10, childDoc(10));
    members.set(10, [
      { childId: 3, order: 0, child: childDoc(3) },
      { childId: 4, order: 1, child: childDoc(4) },
    ]);
    readable.set(3, { id: 3 });
    readable.set(4, { id: 4 });

    await service.reorder(
      10,
      { items: [{ childId: 4, order: 0 }, { childId: 3, order: 1 }] } as any,
      'author',
    );
    expect(db.documentCompositionItem.update).toHaveBeenCalledTimes(2);
  });

  it('locks the full parent and member set in one ascending order', async () => {
    const { db, service, rows, members, readable } = fixture();
    rows.set(10, childDoc(10));
    members.set(10, [
      { childId: 3, order: 0, child: childDoc(3) },
      { childId: 4, order: 1, child: childDoc(4) },
    ]);
    readable.set(3, { id: 3 });
    readable.set(4, { id: 4 });

    await service.reorder(
      10,
      { items: [{ childId: 3, order: 0 }, { childId: 4, order: 1 }] } as any,
      'author',
    );
    expect(db.$queryRaw.mock.calls.map(([sql]: any[]) => sql.values)).toEqual([
      [3],
      [4],
      [10],
    ]);
  });

  it('fails closed if the member graph changed while acquiring locks', async () => {
    const { db, service, rows, readable } = fixture();
    rows.set(10, childDoc(10));
    db.documentCompositionItem.findMany
      .mockResolvedValueOnce([{ childId: 3, order: 0, child: childDoc(3) }])
      .mockResolvedValueOnce([
        { childId: 3, order: 0, child: childDoc(3) },
        { childId: 4, order: 1, child: childDoc(4) },
      ]);
    readable.set(3, { id: 3 });
    readable.set(4, { id: 4 });

    await expect(
      service.reorder(
        10,
        { items: [{ childId: 3, order: 0 }] } as any,
        'author',
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe('merge snapshot authorization', () => {
  it('fails closed when a component is unreadable', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, {
      ...childDoc(10),
      isComposite: true,
    });
    db.documentCompositionItem.findMany.mockResolvedValueOnce([
      { order: 0, child: childDoc(2, { versions: [{ id: 1 }] }) },
    ]);
    await expect(service.authorizeMergeSnapshot(10, 'author')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('fails closed on an incompatible origin', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, { ...childDoc(10) });
    db.documentCompositionItem.findMany.mockResolvedValueOnce([
      {
        order: 0,
        child: childDoc(2, {
          receptionOriginDirectoryId: 2,
          directory: { id: 2, receptionEnabled: true },
        }),
      },
    ]);
    await expect(service.authorizeMergeSnapshot(10, 'author')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a changed graph or version on the final recheck', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, { ...childDoc(10) });
    readable.set(2, { id: 2 });
    db.documentCompositionItem.findMany.mockResolvedValue([
      { order: 0, child: childDoc(2, { versions: [{ id: 1 }] }) },
    ]);

    const snapshot = await service.authorizeMergeSnapshot(10, 'author');
    db.documentCompositionItem.findMany.mockResolvedValue([
      { order: 0, child: childDoc(2, { versions: [{ id: 2 }] }) },
    ]);
    await expect(
      service.recheckMergeSnapshot(10, 'author', snapshot.signature),
    ).rejects.toThrow(ConflictException);
  });

  it('re-authorizes on the final recheck so a revocation fails closed', async () => {
    const { service, readable, db } = fixture();
    readable.set(10, { ...childDoc(10) });
    readable.set(2, { id: 2 });
    db.documentCompositionItem.findMany.mockResolvedValue([
      { order: 0, child: childDoc(2, { versions: [{ id: 1 }] }) },
    ]);

    const snapshot = await service.authorizeMergeSnapshot(10, 'author');
    db.user.findUnique.mockResolvedValue(null);
    await expect(
      service.recheckMergeSnapshot(10, 'author', snapshot.signature),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('selects the latest version deterministically for the merge snapshot', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, { ...childDoc(10) });
    readable.set(2, { id: 2 });
    db.documentCompositionItem.findMany.mockResolvedValue([
      { order: 0, child: childDoc(2, { versions: [{ id: 1 }] }) },
    ]);
    await service.authorizeMergeSnapshot(10, 'author');
    const select = db.documentCompositionItem.findMany.mock.calls[0][0].select;
    expect(select.child.select.versions.orderBy).toEqual({ version: 'desc' });
  });

  it('signature covers the template content and form data consumed by the merge', async () => {
    const { db, service, readable } = fixture();
    readable.set(10, { ...childDoc(10) });
    readable.set(2, { id: 2 });
    const templateChild = (html: string, formData: unknown) => ({
      order: 0,
      child: childDoc(2, {
        versions: [{ id: 1 }],
        templateData: {
          templateId: 5,
          formData,
          template: {
            id: 5,
            htmlTemplate: html,
            styles: null,
            pageSize: 'A4',
            orientation: 'portrait',
          },
        },
      }),
    });

    db.documentCompositionItem.findMany.mockResolvedValue([
      templateChild('<p>A</p>', { nombre: 'Ana' }),
    ]);
    const first = await service.authorizeMergeSnapshot(10, 'author');

    db.documentCompositionItem.findMany.mockResolvedValue([
      templateChild('<p>B</p>', { nombre: 'Ana' }),
    ]);
    const changedTemplate = await service.authorizeMergeSnapshot(10, 'author');

    db.documentCompositionItem.findMany.mockResolvedValue([
      templateChild('<p>A</p>', { nombre: 'Luis' }),
    ]);
    const changedData = await service.authorizeMergeSnapshot(10, 'author');

    expect(changedTemplate.signature).not.toBe(first.signature);
    expect(changedData.signature).not.toBe(first.signature);
  });
});
