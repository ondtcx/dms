import { Prisma } from '@prisma/client';
import { UserRole } from '../role.enum';

export type AccessUser = {
  id: string;
  role: UserRole;
  departmentId: number | null;
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
  if (user.role === UserRole.ADMIN || user.role === UserRole.DIRECTOR) {
    return null;
  }

  const now = new Date();

  // Grant explícito vía DocumentPermission (reutilizado en todos los roles)
  const explicitGrant: Prisma.DocumentWhereInput = {
    permissions: {
      some: {
        canView: true,
        OR: [
          { userId: user.id },
          { role: user.role },
          ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
        ],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      },
    },
  };

  // Acceso base: propios + públicos + grant explícito
  const baseAccess: Prisma.DocumentWhereInput[] = [
    { uploadedById: user.id },
    { isPublic: true },
    explicitGrant,
  ];

  switch (user.role) {
    case UserRole.COORDINADOR:
      return {
        OR: [
          ...baseAccess,
          // Documentos de cursos en su departamento
          ...(user.departmentId
            ? [
                { course: { departmentId: user.departmentId } } as Prisma.DocumentWhereInput,
                { uploadedBy: { departmentId: user.departmentId } } as Prisma.DocumentWhereInput,
              ]
            : []),
        ],
      };

    case UserRole.PROFESOR:
      return {
        OR: [
          ...baseAccess,
          // Documentos de cursos donde imparte clase
          { course: { teachers: { some: { userId: user.id } } } },
          // Documentos de materias donde imparte clase
          { subject: { teachers: { some: { userId: user.id } } } },
        ],
      };

    case UserRole.SECRETARIO:
      return {
        OR: [
          ...baseAccess,
          // Documentos subidos por usuarios de su departamento
          ...(user.departmentId
            ? [{ uploadedBy: { departmentId: user.departmentId } } as Prisma.DocumentWhereInput]
            : []),
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
                  { course: { teachers: { some: { userId: user.id } } } },
                  { subject: { teachers: { some: { userId: user.id } } } },
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
