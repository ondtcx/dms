import { WorkflowTransitionAction } from '@prisma/client';
import { WorkflowService } from './workflow.service';
import { DocumentService } from '../document/document.service';

// El ciclo de corrección atraviesa dos servicios reales sobre un almacén en memoria
// con el índice único (documentId, version) aplicado. No hay base de datos ni
// escritura real de archivos: los dobles solo materializan la coherencia de
// `Document.currentVersion` y la numeración de versiones.
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    writeFileSync: jest.fn(),
    existsSync: jest.fn(() => false),
    unlink: jest.fn((_path: string, cb: (error: Error | null) => void) => cb(null)),
  };
});

const DOCUMENT_ID = 10;
const AUTHOR = 'author';
const REVIEWER = 'reviewer';

function createHarness() {
  const state: any = {
    document: {
      id: DOCUMENT_ID,
      uploadedById: AUTHOR,
      categoryId: 7,
      currentVersion: 1,
      checksumSHA256: 'checksum-v1',
      deletedAt: null,
      directoryId: 2,
      receptionOriginDirectoryId: 2,
      templateData: null,
    },
    versions: [
      {
        id: 100,
        documentId: DOCUMENT_ID,
        version: 1,
        filename: 'acta.txt',
        mimetype: 'text/plain',
        storedName: 'acta.txt',
        path: 'uploads/acta.txt',
        size: 10,
        checksumSHA256: 'checksum-v1',
        comment: null,
        createdById: AUTHOR,
        source: 'UPLOAD_INICIAL',
        workflowId: null,
        supersededAt: null,
      },
    ],
    workflow: {
      id: 1,
      documentId: DOCUMENT_ID,
      templateId: 4,
      definitionVersionId: 30,
      snapshot: {},
      documentVersionId: 100,
      active: true,
      legacyReadOnly: false,
      status: 'IN_PROGRESS',
      currentState: 'coordinador',
      currentStateOrder: 1,
      initiatedById: AUTHOR,
      completedAt: null,
      createdAt: new Date(),
      assignments: [
        {
          id: 2,
          workflowId: 1,
          stageDefinitionId: 40,
          userId: REVIEWER,
          userNameSnapshot: 'Reviewer',
          roleKeySnapshot: 'coordinador',
          status: 'PENDING',
          stageDefinition: { id: 40, order: 1, roleKey: 'coordinador', workflowId: 1 },
        },
      ],
      definitionVersion: { id: 30, templateId: 4, stages: [{ id: 40, order: 1, roleKey: 'coordinador' }] },
    },
    transitions: [] as any[],
    events: [] as any[],
  };
  let idSeq = 500;
  const nextId = () => ++idSeq;

  const hydrateDocument = (include?: any) => {
    const doc: any = { ...state.document };
    if (include?.versions) doc.versions = [...state.versions].sort((a, b) => b.version - a.version);
    if (include?.directory) doc.directory = { receptionEnabled: true };
    if (include?.search) doc.search = { extractedText: null };
    if (include?.workflow) {
      doc.workflow = state.workflow.active
        ? [{ id: state.workflow.id, status: state.workflow.status, currentState: state.workflow.currentState, documentVersionId: state.workflow.documentVersionId }]
        : [];
    }
    if (include?.templateData) doc.templateData = null;
    if (include?.uploadedBy) doc.uploadedBy = { id: AUTHOR, name: 'Author', email: 'author@test' };
    if (include?.category) doc.category = { id: 7, name: 'Categoria', color: '#fff', icon: 'x' };
    if (include?.documentType) doc.documentType = { id: 1, name: 'Tipo' };
    if (include?.academic) doc.academic = null;
    return doc;
  };

  const hydrateWorkflow = (include?: any) => {
    const wf: any = {
      ...state.workflow,
      assignments: state.workflow.assignments.map((assignment: any) => ({ ...assignment })),
      definitionVersion: state.workflow.definitionVersion,
      transitions: state.transitions,
      events: state.events,
    };
    if (include?.document) wf.document = { ...state.document };
    return wf;
  };

  const statusMatches = (expected: any, actual: string) => {
    if (expected === undefined) return true;
    if (typeof expected === 'string') return expected === actual;
    if (expected?.in) return expected.in.includes(actual);
    return true;
  };

  const prisma: any = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    user: {
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, role: 'USER', roleAssignments: [] })),
      findFirst: jest.fn(async () => ({ id: AUTHOR })),
    },
    document: {
      findUnique: jest.fn(async ({ where, include, select }: any) => {
        if (where?.id !== state.document.id) return null;
        if (select) {
          const out: any = {};
          for (const key of Object.keys(select)) out[key] = state.document[key];
          return out;
        }
        return hydrateDocument(include);
      }),
      findFirst: jest.fn(async () =>
        hydrateDocument({ versions: {}, directory: {}, search: {}, templateData: {}, workflow: {}, uploadedBy: {}, category: {}, documentType: {}, academic: {} }),
      ),
      update: jest.fn(async ({ where, data, include }: any) => {
        if (where?.id !== state.document.id) return null;
        const { search, ...rest } = data ?? {};
        Object.assign(state.document, rest);
        return hydrateDocument(include);
      }),
    },
    documentVersion: {
      findFirst: jest.fn(async ({ where, select, orderBy }: any) => {
        const rows = state.versions.filter((row: any) =>
          Object.entries(where ?? {}).every(([key, value]) => value === undefined || row[key] === value),
        );
        if (!rows.length) return null;
        const ordered = orderBy?.version === 'desc' ? [...rows].sort((a, b) => b.version - a.version) : rows;
        const row = ordered[0];
        if (select) {
          const out: any = {};
          for (const key of Object.keys(select)) out[key] = row[key];
          return out;
        }
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: any) => state.versions.find((row: any) => row.id === where.id) ?? null),
      aggregate: jest.fn(async ({ where }: any) => {
        const rows = state.versions.filter((row: any) => !where || row.documentId === where.documentId);
        const max = rows.reduce((value: number, row: any) => Math.max(value, row.version), 0);
        return { _max: { version: max || null } };
      }),
      create: jest.fn(async ({ data }: any) => {
        if (state.versions.some((row: any) => row.documentId === data.documentId && row.version === data.version)) {
          const error: any = new Error('Unique constraint failed on the fields: (`documentId`,`version`)');
          error.code = 'P2002';
          throw error;
        }
        const row = { id: nextId(), supersededAt: null, comment: null, checksumSHA256: null, ...data };
        state.versions.push(row);
        return { ...row };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = state.versions.find((item: any) => item.id === where.id);
        if (!row) throw new Error('version not found');
        Object.assign(row, data);
        return { ...row };
      }),
    },
    documentWorkflow: {
      findUnique: jest.fn(async ({ where, include }: any) => (where?.id === state.workflow.id ? hydrateWorkflow(include) : null)),
      findFirst: jest.fn(async ({ where, select }: any) => {
        const wf = state.workflow;
        if (where?.documentId !== undefined && where.documentId !== wf.documentId) return null;
        if (where?.id !== undefined && where.id !== wf.id) return null;
        if (where?.active !== undefined && where.active !== wf.active) return null;
        if (!statusMatches(where?.status, wf.status)) return null;
        if (select) {
          const out: any = {};
          for (const key of Object.keys(select)) out[key] = wf[key];
          return out;
        }
        return hydrateWorkflow();
      }),
      update: jest.fn(async ({ where, data, include }: any) => {
        if (where?.id !== state.workflow.id) return null;
        Object.assign(state.workflow, data);
        return hydrateWorkflow(include);
      }),
    },
    workflowTransition: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId(), ...data };
        state.transitions.push(row);
        return row;
      }),
    },
    workflowEvent: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId(), ...data };
        state.events.push(row);
        return row;
      }),
    },
    workflowAssignment: {
      update: jest.fn(async ({ where, data }: any) => {
        const assignment = state.workflow.assignments.find((item: any) => item.id === where.id);
        if (assignment) Object.assign(assignment, data);
        return assignment;
      }),
      updateMany: jest.fn(async () => ({ count: state.workflow.assignments.length })),
    },
    documentAccess: { create: jest.fn(async ({ data }: any) => ({ id: nextId(), ...data })) },
  };

  const authorization: any = { hasPermission: jest.fn(async () => true) };
  const directory: any = {
    resolveDocumentReceptionScope: jest.fn(async () => ({
      reception: true,
      directoryId: 2,
      actorId: AUTHOR,
      actorRole: 'profesor',
      capabilities: { review: true, readAll: true, submit: true, discover: true },
    })),
    assertDocumentMutation: jest.fn(async () => true),
    assertReceptionRead: jest.fn(async () => undefined),
  };
  const storage: any = {
    generateStructuredPath: jest.fn((_user: string, _category: number, name: string) => ({ path: `uploads/${name}` })),
    calculateFileHash: jest.fn(async () => 'checksum-author'),
    moveFile: jest.fn(),
    copyFile: jest.fn(),
    deleteFile: jest.fn(),
    fileExists: jest.fn(() => false),
    getPaths: jest.fn(() => ({ temp: 'uploads/temp', thumbnails: 'uploads/thumbs' })),
  };
  const thumbnailService: any = { regenerateThumbnail: jest.fn(async () => undefined) };
  const textExtractionService: any = { extractFromFile: jest.fn(async () => 'texto corregido') };
  const pdfOcrService: any = { enqueue: jest.fn() };

  const workflowService = new WorkflowService(prisma, authorization);
  (workflowService as any).directory = directory;
  const documentService = new DocumentService(
    prisma,
    storage,
    {} as any,
    thumbnailService,
    {} as any,
    directory,
    textExtractionService,
    pdfOcrService,
  );

  return { state, prisma, workflowService, documentService };
}

describe('workflow correction lifecycle (cross-service)', () => {
  it('links the request-changes clone to the document counter and lets the next real author correction allocate a distinct version', async () => {
    const { state, workflowService, documentService } = createHarness();

    // 1. El revisor solicita cambios sobre la versión vigente ligada al workflow.
    await workflowService.transition(
      1,
      { action: WorkflowTransitionAction.REQUEST_CHANGES, comment: 'Adjunta el acta firmada', versionId: 100 },
      REVIEWER,
      'profesor',
    );

    const correction = state.versions.find((version: any) => version.source === 'CAMBIOS_SOLICITADOS');
    expect(correction).toBeDefined();
    // La corrección clonada pasa a ser la fila vigente del documento en la misma transacción.
    expect(state.document.currentVersion).toBe(correction.version);
    expect(state.workflow.documentVersionId).toBe(correction.id);

    // 2. El siguiente camino real del autor (DocumentService) usa currentVersion + 1.
    //    Debe asignar una versión distinta, sin colisión del índice único.
    await documentService.saveTextContent(DOCUMENT_ID, 'contenido corregido por el autor', AUTHOR, 'profesor' as any);

    const versionNumbers = state.versions.map((version: any) => version.version);
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
    const authorCorrection = state.versions
      .filter((version: any) => version.source === 'CAMBIOS_SOLICITADOS' && version.createdById === AUTHOR)
      .sort((a: any, b: any) => a.version - b.version)
      .pop();
    expect(authorCorrection).toBeDefined();
    expect(authorCorrection.workflowId).toBe(1);
    expect(authorCorrection.version).toBe(correction.version + 1);
    expect(state.workflow.documentVersionId).toBe(authorCorrection.id);
    expect(state.document.currentVersion).toBe(authorCorrection.version);

    // 3. El reenvío del autor liga exactamente la corrección vigente del mismo workflow.
    await expect(
      workflowService.transition(
        1,
        { action: WorkflowTransitionAction.SUBMIT, versionId: authorCorrection.id },
        AUTHOR,
        'profesor',
      ),
    ).resolves.toBeDefined();
    expect(state.workflow.status).toBe('IN_PROGRESS');
  });
});
