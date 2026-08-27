import { UserRole } from '../role.enum';
import { buildDocumentAccessFilter } from './document-access.filter';

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
    expect(coordinatorFilter?.OR).toEqual(
      expect.arrayContaining([
        { uploadedById: 'coordinator-id' },
        { isPublic: true },
      ]),
    );
  });

  it('retains explicit user, role, course-teacher, and subject-teacher rules', () => {
    const professorFilter = buildDocumentAccessFilter({
      id: 'professor-id',
      role: UserRole.PROFESOR,
    });

    expect(JSON.stringify(professorFilter)).not.toContain('department');
    expect(professorFilter?.OR).toEqual(
      expect.arrayContaining([
        { uploadedById: 'professor-id' },
        { isPublic: true },
        expect.objectContaining({ permissions: expect.any(Object) }),
        expect.objectContaining({ academic: { course: { teachers: { some: { userId: 'professor-id' } } } } }),
        expect.objectContaining({ academic: { subject: { teachers: { some: { userId: 'professor-id' } } } } }),
      ]),
    );
  });

  it('matches active catalog role grants and shares alongside legacy grants', () => {
    const filter = buildDocumentAccessFilter({
      id: 'editor-id',
      role: UserRole.USER,
      assignments: [{ id: 12, key: 'editor', isActive: true }],
    });

    expect(JSON.stringify(filter)).toContain('roleId');
    expect(JSON.stringify(filter)).toContain('shares');
    expect(JSON.stringify(filter)).toContain('permissions');
    expect(JSON.stringify(filter)).toContain('12');
  });

  it('does not include inactive catalog assignments in document access', () => {
    const filter = buildDocumentAccessFilter({
      id: 'editor-id',
      role: UserRole.USER,
      assignments: [{ id: 13, key: 'editor', isActive: false }],
    });

    expect(JSON.stringify(filter)).not.toContain('13');
  });
});
