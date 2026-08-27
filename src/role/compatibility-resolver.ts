export type RoleAssignment = {
  id?: number;
  key: string;
  isActive: boolean;
};

export type RoleGrant = {
  legacyRole?: string | null;
  roleKey?: string | null;
};

export function resolveRoleGrantFields(
  roleKey: string,
  roleId: number,
  legacyRole: string | null | undefined,
): { role: string | null; roleId: number } {
  return { role: legacyRole ?? (LEGACY_ROLE_KEYS[roleKey] ? roleKey : null), roleId };
}

export const LEGACY_ROLE_KEYS: Readonly<Record<string, string>> = {
  rector: 'rector',
  vicerrector: 'vicerrector',
  coordinador: 'coordinador',
  profesor: 'profesor',
  secretario: 'secretario',
  padre: 'padre',
  estudiante: 'estudiante',
  moderador: 'moderador',
  admin: 'admin',
  user: 'user',
};

export function resolveEffectiveRoleKeys(
  legacyRole: string | null | undefined,
  assignments: RoleAssignment[],
): string[] {
  const keys = new Set<string>();
  const mappedKey = legacyRole ? LEGACY_ROLE_KEYS[legacyRole] : undefined;

  if (mappedKey) {
    keys.add(mappedKey);
  }

  for (const assignment of assignments) {
    if (assignment.isActive) {
      keys.add(assignment.key);
    }
  }

  return [...keys];
}

export function getUnmappedLegacyRoles(
  legacyRoles: string[],
  mappings: Readonly<Record<string, string>> = LEGACY_ROLE_KEYS,
): string[] {
  return [...new Set(legacyRoles.filter((role) => !mappings[role]))];
}

export function roleGrantMatchesUser(
  grant: RoleGrant,
  legacyRole: string | null | undefined,
  assignments: RoleAssignment[],
): boolean {
  const effectiveKeys = resolveEffectiveRoleKeys(legacyRole, assignments);
  const mappedLegacyRole = grant.legacyRole ? LEGACY_ROLE_KEYS[grant.legacyRole] : undefined;

  return Boolean(
    (mappedLegacyRole && effectiveKeys.includes(mappedLegacyRole)) ||
      (grant.roleKey && effectiveKeys.includes(grant.roleKey)),
  );
}

export function buildRoleGrantFilter(
  userId: string,
  legacyRole: string | null | undefined,
  assignments: RoleAssignment[],
) {
  const clauses: Array<Record<string, unknown>> = [{ userId }];
  if (legacyRole) clauses.push({ role: legacyRole });

  const roleIds = assignments
    .filter((assignment) => assignment.isActive && assignment.id !== undefined)
    .map((assignment) => assignment.id);
  if (roleIds.length > 0) clauses.push({ roleId: { in: roleIds } });

  return { OR: clauses };
}
