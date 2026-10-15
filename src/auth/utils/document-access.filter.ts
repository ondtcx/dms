import { Prisma } from '@prisma/client';
import { UserRole } from '../role.enum';
import { RoleAssignment } from '../../role/compatibility-resolver';

export type AccessUser = {
  id: string;
  role: UserRole;
  assignments?: RoleAssignment[];
};

/**
 * Construye un filtro Prisma de acceso a documentos basado en las relaciones
 * naturales del usuario (ReBAC).
 *
 * Separa los documentos ordinarios de la recepción: ninguna concesión histórica
 * ni rol global sustituye la participación o delegación vigente de la carpeta.
 */
export function buildDocumentAccessFilter(
  user: AccessUser,
  ordinaryAccess?: Prisma.DocumentWhereInput,
): Prisma.DocumentWhereInput {
  if (!user?.id) return { id: -1 };
  const activeRole: Prisma.DirectoryRoleParticipantWhereInput = {
    role: { isActive: true, assignments: { some: { userId: user.id } } },
  };
  const participant: Prisma.DirectoryWhereInput = {
    OR: [
      { userParticipants: { some: { userId: user.id } } },
      { roleParticipants: { some: activeRole } },
    ],
  };
  const receptionFolder: Prisma.DirectoryWhereInput = {
    receptionEnabled: true,
    OR: [
      { createdById: user.id },
      { delegates: { some: { userId: user.id, OR: [{ full: true }, { readAll: true }, { review: true }] } } },
      { userParticipants: { some: { userId: user.id, peerRead: true } } },
      {
        userParticipants: { none: { userId: user.id } },
        roleParticipants: {
          some: { ...activeRole, peerRead: true },
          none: { ...activeRole, peerRead: false },
        },
      },
    ],
  };
  const folderAccess = (relation: 'directory' | 'receptionOriginDirectory'): Prisma.DocumentWhereInput => ({
    OR: [
      { [relation]: receptionFolder },
      { uploadedById: user.id, [relation]: { receptionEnabled: true, ...participant } },
    ],
  });
  return {
    OR: [
      { AND: [
        { receptionOriginDirectory: null, OR: [{ directory: null }, { directory: { receptionEnabled: false } }] },
        buildOrdinaryDocumentAccessFilter(user),
        ...(ordinaryAccess ? [ordinaryAccess] : []),
      ] },
      { receptionOriginDirectory: null, ...folderAccess('directory') },
      folderAccess('receptionOriginDirectory'),
    ],
  };
}

// Segunda comprobación vigente para SQL que ya recibió IDs del filtro Prisma.
// El alias d corresponde al documento candidato; las concesiones ordinarias
// siguen resolviéndose exclusivamente mediante buildDocumentAccessFilter.
export function buildReceptionReadSqlRestriction(userId: string): Prisma.Sql {
  const direct = (peerRead?: boolean) => Prisma.sql`EXISTS (
    SELECT 1 FROM "DirectoryUserParticipant" p
    WHERE p."directoryId" = folder.id AND p."userId" = ${userId}
    ${peerRead === undefined ? Prisma.empty : Prisma.sql`AND p."peerRead" = ${peerRead}`}
  )`;
  const role = (peerRead?: boolean) => Prisma.sql`EXISTS (
    SELECT 1 FROM "DirectoryRoleParticipant" p
    JOIN "Role" r ON r.id = p."roleId" AND r."isActive" = TRUE
    JOIN "UserRoleAssignment" a ON a."roleId" = r.id AND a."userId" = ${userId}
    WHERE p."directoryId" = folder.id
    ${peerRead === undefined ? Prisma.empty : Prisma.sql`AND p."peerRead" = ${peerRead}`}
  )`;
  return Prisma.sql`(
    (d."receptionOriginDirectoryId" IS NULL AND d."directoryId" IS NULL) OR EXISTS (
      SELECT 1 FROM "Directory" folder
      WHERE folder.id = COALESCE(d."receptionOriginDirectoryId", d."directoryId") AND (
        (d."receptionOriginDirectoryId" IS NULL AND folder."receptionEnabled" = FALSE)
        OR (folder."receptionEnabled" = TRUE AND (folder."createdById" = ${userId}
        OR EXISTS (
          SELECT 1 FROM "DirectoryDelegate" manager
          WHERE manager."directoryId" = folder.id AND manager."userId" = ${userId}
          AND (manager.full = TRUE OR manager."readAll" = TRUE OR manager.review = TRUE)
        )
        OR (d."uploadedById" = ${userId} AND (${direct()} OR ${role()}))
        OR ${direct(true)}
        OR (NOT ${direct()} AND ${role(true)} AND NOT ${role(false)})))
      )
    )
  )`;
}

// Las reglas ordinarias conservan las concesiones y compatibilidad previas.
function buildOrdinaryDocumentAccessFilter(user: AccessUser): Prisma.DocumentWhereInput {
  if (!user.id) return { id: -1 };
  const now = new Date();

  // Grant explícito vía DocumentPermission (reutilizado en todos los roles)
  const explicitGrant: Prisma.DocumentWhereInput = {
    permissions: {
      some: {
        canView: true,
        userId: user.id,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
      },
    },
  };

  const shareGrant: Prisma.DocumentWhereInput = {
    shares: {
      some: {
        userId: user.id,
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

  return { OR: [
    ...baseAccess,
    { effectiveGrants: { some: { userId: user.id, canView: true } } },
    { directory: buildOrdinaryDirectoryAccessFilter(user.id) },
    // La participación explícita de workflow no es un bypass de rol académico.
    { workflow: { some: { active: true, OR: [
      { initiatedById: user.id }, { approvals: { some: { userId: user.id } } },
    ] } } },
  ] } as Prisma.DocumentWhereInput;
}

export function buildOrdinaryDirectoryAccessFilter(userId: string): Prisma.DirectoryWhereInput {
  if (!userId) return { id: -1 };
  return { receptionEnabled: false, ancestors: { some: { ancestor: {
    receptionEnabled: false, OR: [
      { createdById: userId }, { isPublic: true },
      { effectiveGrants: { some: { userId, canView: true } } },
    ],
  } } } } as Prisma.DirectoryWhereInput;
}
