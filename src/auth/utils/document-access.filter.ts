import { Prisma } from '@prisma/client';


export type AccessUser = {
  id: string;
  role: string;
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
  if (user.role === 'admin' || user.role === 'rector') {
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
          { role: { name: user.role } },
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
    case 'coordinador':
      return {
        OR: [
          ...baseAccess,
          // Documentos de cursos en su departamento
          ...(user.departmentId
            ? [
                {
                  academic: { course: { departmentId: user.departmentId } },
                } as Prisma.DocumentWhereInput,
                {
                  uploadedBy: { departmentId: user.departmentId },
                } as Prisma.DocumentWhereInput,
              ]
            : []),
        ],
      };

    case 'profesor':
      return {
        OR: [
          ...baseAccess,
          // Documentos de cursos donde imparte clase
          { academic: { course: { teachers: { some: { userId: user.id } } } } },
          // Documentos de materias donde imparte clase
          { academic: { subject: { teachers: { some: { userId: user.id } } } } },
        ],
      };

    case 'secretario':
      return {
        OR: [
          ...baseAccess,
          // Documentos subidos por usuarios de su departamento
          ...(user.departmentId
            ? [
                {
                  uploadedBy: { departmentId: user.departmentId },
                } as Prisma.DocumentWhereInput,
              ]
            : []),
        ],
      };

    case 'estudiante':
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

    case 'padre':
      return {
        OR: [{ isPublic: true }, explicitGrant],
      };

    default:
      // MODERADOR, USER y cualquier rol futuro
      return { OR: baseAccess };
  }
}
