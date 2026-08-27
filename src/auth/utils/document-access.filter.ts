import { Prisma } from '@prisma/client';
import { UserRole } from '../role.enum';
import { buildRoleGrantFilter, RoleAssignment } from '../../role/compatibility-resolver';

export type AccessUser = {
  id: string;
  role: UserRole;
  assignments?: RoleAssignment[];
};

/**
 * Construye un filtro Prisma de acceso a documentos basado en las relaciones
 * naturales del usuario (ReBAC).
 *
 * Retorna null para usuarios privilegiados (ADMIN / DIRECTOR) — sin restricción.
 * Retorna un Prisma.DocumentWhereInput con cláusula OR para los demás roles.
 */
export function buildDocumentAccessFilter(
  user: AccessUser,
): Prisma.DocumentWhereInput | null {
  // ADMIN y DIRECTOR ven todo sin restricción
  if (user.role === UserRole.ADMIN || user.role === UserRole.RECTOR) {
    return null;
  }

  const now = new Date();
  const roleGrantFilter = buildRoleGrantFilter(user.id, user.role, user.assignments ?? []);

  // Grant explícito vía DocumentPermission (reutilizado en todos los roles)
  const explicitGrant: Prisma.DocumentWhereInput = {
    permissions: {
      some: {
        canView: true,
        ...roleGrantFilter,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      },
    },
  };

  const shareGrant: Prisma.DocumentWhereInput = {
    shares: {
      some: {
        ...roleGrantFilter,
        canView: true,
        revokedAt: null,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      },
    },
  };

  // Acceso base: propios + públicos + grant explícito
  const baseAccess: Prisma.DocumentWhereInput[] = [
    { uploadedById: user.id },
    { isPublic: true },
    explicitGrant,
    shareGrant,
  ];

  switch (user.role) {
    case UserRole.COORDINADOR:
      return {
        OR: [
          ...baseAccess,
        ],
      };

    case UserRole.PROFESOR:
      return {
        OR: [
          ...baseAccess,
          // Documentos de cursos donde imparte clase
          { academic: { course: { teachers: { some: { userId: user.id } } } } },
          // Documentos de materias donde imparte clase
          { academic: { subject: { teachers: { some: { userId: user.id } } } } },
        ],
      };

    case UserRole.SECRETARIO:
      return {
        OR: [
          ...baseAccess,
        ],
      };

    case UserRole.ESTUDIANTE:
      return {
        OR: [
          { uploadedById: user.id },
          explicitGrant,
          // Documentos públicos de cursos o materias en que está inscrito
          {
            AND: [
              { isPublic: true },
              {
                OR: [
                  { academic: { course: { teachers: { some: { userId: user.id } } } } },
                  { academic: { subject: { teachers: { some: { userId: user.id } } } } },
                ],
              },
            ],
          },
        ],
      };

    case UserRole.PADRE:
      return {
        OR: [{ isPublic: true }, explicitGrant],
      };

    default:
      // MODERADOR, USER y cualquier rol futuro
      return { OR: baseAccess };
  }
}
