import { UserRole } from '../role.enum';
import { buildDocumentAccessFilter, buildReceptionReadSqlRestriction } from './document-access.filter';

// Evalúa el subconjunto de predicados Prisma usado por el filtro de lectura.
function matches(value: any, predicate: any): boolean {
  return Object.entries(predicate).every(([key, expected]: [string, any]) => {
    if (key === 'OR') return expected.some((clause: any) => matches(value, clause));
    if (key === 'AND') return expected.every((clause: any) => matches(value, clause));
    // Las filas ordinarias de fixtures anteriores representan una relación nullable.
    const actual = key === 'receptionOriginDirectory' ? value?.[key] ?? null : value?.[key];
    if (expected === null || typeof expected !== 'object') return actual === expected;
    if ('some' in expected || 'none' in expected) {
      return (!('some' in expected) || (actual ?? []).some((item: any) => matches(item, expected.some)))
        && (!('none' in expected) || !(actual ?? []).some((item: any) => matches(item, expected.none)));
    }
    if ('gte' in expected) return actual instanceof Date && actual >= expected.gte;
    if ('in' in expected) return expected.in.includes(actual);
    return actual != null && matches(actual, expected);
  });
}

describe('authenticated read access across roles', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const restrictedRoles = Object.values(UserRole);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());

  it.each(restrictedRoles)('%s allows public, uploader and selected-user access only when valid', (role) => {
    const filter = buildDocumentAccessFilter({ id: 'reader', role });
    const document = { directory: null, uploadedById: 'other', isPublic: false, permissions: [], shares: [] };
    const grant = { userId: 'reader', canView: true, expiresAt: null };
    expect(filter).not.toBeNull();
    expect(matches(document, filter)).toBe(false);
    expect(matches({ ...document, isPublic: true }, filter)).toBe(true);
    expect(matches({ ...document, uploadedById: 'reader' }, filter)).toBe(true);

    for (const relation of ['permissions', 'shares']) {
      const activeGrant = { ...grant, ...(relation === 'shares' ? { revokedAt: null } : {}) };
      for (const expiresAt of [null, now, new Date(now.getTime() + 1)]) {
        expect(matches({ ...document, [relation]: [{ ...activeGrant, expiresAt }] }, filter)).toBe(true);
      }
      for (const override of [
        { expiresAt: new Date(now.getTime() - 1) },
        { canView: false },
        { userId: 'unrelated' },
        ...(relation === 'shares' ? [{ revokedAt: now }] : []),
      ]) {
        expect(matches({ ...document, [relation]: [{ ...activeGrant, ...override }] }, filter)).toBe(false);
      }
    }
  });

  it.each([UserRole.ADMIN, UserRole.RECTOR])('%s has no ordinary or reception wildcard', (role) => {
    const filter = buildDocumentAccessFilter({ id: 'reader', role });
    expect(filter).not.toBeNull();
    expect(matches({ directory: null }, filter)).toBe(false);
    expect(matches({ directory: { receptionEnabled: false } }, filter)).toBe(false);
    expect(matches({ directory: { receptionEnabled: true, createdById: 'other' } }, filter)).toBe(false);
  });

  it.each(['course', 'subject'])('does not infer private %s access from academic membership', (relation) => {
    const document = {
      directory: null, uploadedById: 'other', isPublic: false, permissions: [], shares: [],
      academic: { [relation]: { teachers: [{ userId: 'reader' }] } },
    };
    expect(matches(document, buildDocumentAccessFilter({ id: 'reader', role: UserRole.PROFESOR }))).toBe(false);
    expect(matches(document, buildDocumentAccessFilter({ id: 'reader', role: UserRole.ESTUDIANTE }))).toBe(false);
    document.academic[relation].teachers = [{ userId: 'other' }];
    expect(matches(document, buildDocumentAccessFilter({ id: 'reader', role: UserRole.PROFESOR }))).toBe(false);
  });
});

describe('live reception access', () => {
  const reader = 'reader';
  const roleRule = (peerRead: boolean, isActive = true, assigned = true) => ({
    peerRead, role: { isActive, assignments: assigned ? [{ userId: reader }] : [] },
  });
  const directory = (overrides: any = {}) => ({
    receptionEnabled: true, createdById: 'owner',
    userParticipants: [], roleParticipants: [], delegates: [], ...overrides,
  });
  const document = (folder: any, uploadedById = 'other') => ({
    directory: folder, uploadedById, isPublic: true,
    permissions: [{ userId: reader, canView: true, expiresAt: null }],
    shares: [{ userId: reader, canView: true, expiresAt: null, revokedAt: null }],
    academic: { course: { teachers: [{ userId: reader }] } },
    workflow: [{ approvals: [{ userId: reader }] }],
  });
  const allowed = (folder: any, uploader = 'other', role = UserRole.PROFESOR) =>
    matches(document(folder, uploader), buildDocumentAccessFilter({
      id: reader, role, assignments: [{ id: 99, key: 'stale', isActive: true }],
    }));

  it.each(Object.values(UserRole))('%s cannot revive a revoked uploader through old grants', (role) => {
    expect(allowed(directory(), reader, role)).toBe(false);
    expect(allowed(directory(), 'other', role)).toBe(false);
    expect(allowed(directory({ createdById: reader }), 'other', role)).toBe(true);
    expect(allowed(directory({ delegates: [{ userId: reader, readAll: true }] }), 'other', role)).toBe(true);
  });

  it.each(['full', 'readAll', 'review'])('allows explicit %s delegate access after participant revocation', (capability) => {
    expect(allowed(directory({ delegates: [{ userId: reader, [capability]: true }] }))).toBe(true);
    expect(allowed(directory({ delegates: [{ userId: 'other', [capability]: true }] }))).toBe(false);
  });

  it('denies metadata-only managers document access, even to historical submissions', () => {
    const folder = directory({ delegates: [{ userId: reader, configure: true, manageParticipants: true, manageStructure: true }] });
    expect(allowed(folder)).toBe(false);
    expect(allowed(folder, reader)).toBe(false);
  });

  it('restricts current direct and live role participants to own submissions', () => {
    for (const rule of [
      { userParticipants: [{ userId: reader, peerRead: false }] },
      { roleParticipants: [roleRule(false)] },
    ]) {
      expect(allowed(directory(rule), reader)).toBe(true);
      expect(allowed(directory(rule))).toBe(false);
    }
  });

  it('revokes all old submission access on role deactivation or assignment removal', () => {
    for (const rule of [roleRule(true, false), roleRule(true, true, false)]) {
      expect(allowed(directory({ roleParticipants: [rule] }), reader)).toBe(false);
      expect(allowed(directory({ roleParticipants: [rule] }))).toBe(false);
    }
  });

  it('direct peer-read overrides role restrictions and direct own-only overrides role peer-read', () => {
    expect(allowed(directory({ userParticipants: [{ userId: reader, peerRead: true }], roleParticipants: [roleRule(false)] }))).toBe(true);
    expect(allowed(directory({ userParticipants: [{ userId: reader, peerRead: false }], roleParticipants: [roleRule(true)] }))).toBe(false);
  });

  it('uses restrictive live-role visibility without a direct rule, ignoring inactive restrictions', () => {
    expect(allowed(directory({ roleParticipants: [roleRule(true)] }))).toBe(true);
    expect(allowed(directory({ roleParticipants: [roleRule(true), roleRule(false)] }))).toBe(false);
    expect(allowed(directory({ roleParticipants: [roleRule(true), roleRule(false, false)] }))).toBe(true);
    expect(allowed(directory({ roleParticipants: [roleRule(true), roleRule(false)] }), reader)).toBe(true);
  });
});

describe('durable reception origin', () => {
  it('binds identity and resolves SQL origin before physical location without an ordinary origin bypass', () => {
    const identity = "reader' OR TRUE --";
    const restriction = buildReceptionReadSqlRestriction(identity);
    expect(restriction.sql).toContain('COALESCE(d."receptionOriginDirectoryId", d."directoryId")');
    expect(restriction.sql).toContain('(d."receptionOriginDirectoryId" IS NULL AND d."directoryId" IS NULL)');
    expect(restriction.sql).toContain('(d."receptionOriginDirectoryId" IS NULL AND folder."receptionEnabled" = FALSE)');
    expect(restriction.sql).not.toContain(identity);
    expect(restriction.values.filter(value => value === identity).length).toBeGreaterThan(5);
  });
  it('keeps origin peer visibility restrictive across live catalog revocation after a physical move', () => {
    const origin = { receptionEnabled: true, createdById: 'owner', userParticipants: [], delegates: [],
      roleParticipants: [{ peerRead: true, role: { isActive: true, assignments: [{ userId: 'reader' }] } }] };
    const doc = { receptionOriginDirectory: origin, directory: { receptionEnabled: false }, uploadedById: 'other', isPublic: true };
    const filter = buildDocumentAccessFilter({ id: 'reader', role: UserRole.ADMIN });
    expect(matches(doc, filter)).toBe(true);
    origin.roleParticipants[0].peerRead = false;
    expect(matches(doc, filter)).toBe(false);
    origin.roleParticipants[0].peerRead = true;
    origin.roleParticipants[0].role.isActive = false;
    expect(matches(doc, filter)).toBe(false);
    origin.roleParticipants[0].role.isActive = true;
    origin.roleParticipants[0].role.assignments = [];
    expect(matches(doc, filter)).toBe(false);
  });
  it.each(Object.values(UserRole))('%s cannot regain public, shared, academic or uploader access after withdrawal and revocation', (role) => {
    const doc = {
      receptionOriginDirectory: { receptionEnabled: true, createdById: 'owner', userParticipants: [], roleParticipants: [], delegates: [] },
      directory: null, uploadedById: 'reader', isPublic: true,
      permissions: [{ userId: 'reader', canView: true, expiresAt: null }],
      shares: [{ userId: 'reader', canView: true, expiresAt: null, revokedAt: null }],
      academic: { course: { teachers: [{ userId: 'reader' }] } },
    };
    const filter = buildDocumentAccessFilter({ id: 'reader', role });
    expect(matches(doc, filter)).toBe(false);
    doc.receptionOriginDirectory.userParticipants = [{ userId: 'reader', peerRead: false }] as any;
    expect(matches(doc, filter)).toBe(true);
    doc.receptionOriginDirectory.userParticipants = [];
    doc.directory = { receptionEnabled: true, createdById: 'reader' } as any;
    expect(matches(doc, filter)).toBe(false);
    doc.receptionOriginDirectory.delegates = [{ userId: 'reader', review: true }] as any;
    expect(matches(doc, filter)).toBe(true);
  });
});

describe('buildDocumentAccessFilter', () => {
  it('denies coordinator and secretary access based only on former department membership', () => {
    const coordinatorFilter = buildDocumentAccessFilter({
      id: 'coordinator-id',
      role: UserRole.COORDINADOR,
    });
    const secretaryFilter = buildDocumentAccessFilter({
      id: 'secretary-id',
      role: UserRole.SECRETARIO,
    });

    expect(coordinatorFilter).toEqual(expect.objectContaining({ OR: expect.any(Array) }));
    expect(secretaryFilter).toEqual(expect.objectContaining({ OR: expect.any(Array) }));
    expect(JSON.stringify(coordinatorFilter)).not.toContain('department');
    expect(JSON.stringify(secretaryFilter)).not.toContain('department');
    expect((coordinatorFilter.OR as any[])[0].AND[1].OR).toEqual(
      expect.arrayContaining([
        { uploadedById: 'coordinator-id' },
        { isPublic: true },
      ]),
    );
  });

  it('uses named grants and query-resolvable inherited access rather than academic roles', () => {
    const professorFilter = buildDocumentAccessFilter({
      id: 'professor-id',
      role: UserRole.PROFESOR,
    });

    expect(JSON.stringify(professorFilter)).not.toContain('department');
    expect((professorFilter.OR as any[])[0].AND[1].OR).toEqual(
      expect.arrayContaining([
        { uploadedById: 'professor-id' },
        { isPublic: true },
        expect.objectContaining({ permissions: expect.any(Object) }),
        expect.objectContaining({ effectiveGrants: { some: { userId: 'professor-id', canView: true } } }),
        expect.objectContaining({ directory: expect.objectContaining({ ancestors: expect.any(Object) }) }),
      ]),
    );
  });

  it('does not expand ordinary access through catalog role grants', () => {
    jest.useFakeTimers();
    const now = new Date('2026-10-14T18:12:00.000Z');
    jest.setSystemTime(now);
    try {
      const filter = buildDocumentAccessFilter({
        id: 'editor-id',
        role: UserRole.USER,
        assignments: [{ id: 12, key: 'editor', isActive: true }],
      });

      const ordinaryClauses = (filter.OR as any[])[0].AND[1].OR;
      const expiry = [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }];
      expect(ordinaryClauses.find(clause => clause.permissions)).toEqual({
        permissions: { some: { canView: true, userId: 'editor-id', AND: expiry } },
      });
      expect(ordinaryClauses.find(clause => clause.shares)).toEqual({
        shares: { some: { userId: 'editor-id', canView: true, revokedAt: null, AND: expiry } },
      });
      expect(filter).toEqual(buildDocumentAccessFilter({ id: 'editor-id', role: UserRole.USER }));

      const document = { directory: null, uploadedById: 'other', isPublic: false };
      for (const relation of ['permissions', 'shares', 'effectiveGrants']) {
        for (const target of [{ roleId: 12 }, { role: UserRole.USER }, { userId: 'other', roleId: 12 }]) {
          const grant = { ...target, canView: true, expiresAt: null, revokedAt: null };
          expect(matches({ ...document, [relation]: [grant] }, filter)).toBe(false);
        }
        const grant = { userId: 'editor-id', canView: true, expiresAt: null, revokedAt: null };
        expect(matches({ ...document, [relation]: [grant] }, filter)).toBe(true);
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it('inherits read for descendants and future content and loses it after revocation or a move', () => {
    const ancestor = { receptionEnabled: false, createdById: 'owner', isPublic: false,
      effectiveGrants: [{ userId: 'reader', canView: true }] };
    const directory = { receptionEnabled: false, ancestors: [{ ancestor }] };
    const filter = buildDocumentAccessFilter({ id: 'reader', role: UserRole.USER });
    for (const id of [1, 2, 999]) expect(matches({ id, directory, uploadedById: 'owner' }, filter)).toBe(true);
    ancestor.effectiveGrants = [];
    expect(matches({ directory, uploadedById: 'owner' }, filter)).toBe(false);
    ancestor.isPublic = true;
    expect(matches({ directory, uploadedById: 'owner' }, filter)).toBe(true);
    expect(matches({ directory: { receptionEnabled: false, ancestors: [] }, uploadedById: 'owner' }, filter)).toBe(false);
    expect(matches({ directory: { ...directory, receptionEnabled: true }, uploadedById: 'owner' }, filter)).toBe(false);
  });

  it('does not include inactive catalog assignments in document access', () => {
    const filter = buildDocumentAccessFilter({
      id: 'editor-id',
      role: UserRole.USER,
      assignments: [{ id: 13, key: 'editor', isActive: false }],
    });

    expect(JSON.stringify(filter)).not.toContain('"roleId":{"in":[13]}');
  });
});
