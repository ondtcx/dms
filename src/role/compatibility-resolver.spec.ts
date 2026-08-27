import {
  getUnmappedLegacyRoles,
  buildRoleGrantFilter,
  resolveRoleGrantFields,
  resolveEffectiveRoleKeys,
  roleGrantMatchesUser,
} from './compatibility-resolver';

describe('compatibility resolver', () => {
  it('maps legacy admin and user roles to catalog keys', () => {
    expect(resolveEffectiveRoleKeys('admin', [])).toEqual(['admin']);
    expect(resolveEffectiveRoleKeys('user', [])).toEqual(['user']);
  });

  it('ignores inactive assignments while retaining active assignments', () => {
    expect(
      resolveEffectiveRoleKeys('user', [
        { key: 'catalog-editor', isActive: true },
        { key: 'expired-editor', isActive: false },
      ]),
    ).toEqual(['user', 'catalog-editor']);
  });

  it('reports legacy values without a catalog mapping', () => {
    expect(getUnmappedLegacyRoles(['admin', 'unknown', 'unknown', 'user'])).toEqual(['unknown']);
  });

  it('preserves equivalent access for legacy and catalog role grants', () => {
    const assignments = [{ key: 'catalog-editor', isActive: true }];

    expect(roleGrantMatchesUser({ legacyRole: 'admin' }, 'admin', [])).toBe(true);
    expect(roleGrantMatchesUser({ roleKey: 'catalog-editor' }, 'user', assignments)).toBe(true);
    expect(roleGrantMatchesUser({ roleKey: 'inactive-role' }, 'user', assignments)).toBe(false);
  });

  it('builds a dual-read filter for legacy and assigned catalog roles', () => {
    expect(
      buildRoleGrantFilter('user-1', 'user', [
        { id: 7, key: 'editor', isActive: true },
        { id: 8, key: 'inactive', isActive: false },
      ]),
    ).toEqual({
      OR: [{ userId: 'user-1' }, { role: 'user' }, { roleId: { in: [7] } }],
    });
  });

  it('keeps direct user access when no legacy role is available', () => {
    expect(buildRoleGrantFilter('user-2', null, [])).toEqual({
      OR: [{ userId: 'user-2' }],
    });
  });

  it('dual-writes a catalog role legacy identity only when the mapping exists', () => {
    expect(resolveRoleGrantFields('admin', 9, 'admin')).toEqual({ role: 'admin', roleId: 9 });
    expect(resolveRoleGrantFields('editor', 10, null)).toEqual({ role: null, roleId: 10 });
  });
});
