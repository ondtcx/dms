export interface ReceptionParticipantRule {
  peerRead: boolean;
}

export interface ReceptionDelegateRule {
  full?: boolean;
  configure?: boolean;
  manageParticipants?: boolean;
  readAll?: boolean;
  review?: boolean;
  manageDelegates?: boolean;
  manageStructure?: boolean;
}

export interface ReceptionCapabilityInput {
  ownerId: string;
  userId: string;
  directParticipant: ReceptionParticipantRule | null;
  // Solo reglas de roles de catálogo con asignación vigente y activa.
  roleParticipants: readonly ReceptionParticipantRule[];
  delegate: ReceptionDelegateRule | null;
}

const operationalKeys = [
  'configure', 'manageParticipants', 'readAll', 'review', 'manageDelegates', 'manageStructure',
] as const;

type OperationalKey = (typeof operationalKeys)[number];

export type ReceptionCapabilities = Record<OperationalKey, boolean> & {
  owner: boolean;
  discover: boolean;
  submit: boolean;
  peerRead: boolean;
};

function operationalPermissions(rule: ReceptionDelegateRule | null): Record<OperationalKey, boolean> {
  const full = rule?.full === true;
  return {
    configure: full || rule?.configure === true,
    manageParticipants: full || rule?.manageParticipants === true,
    readAll: full || rule?.readAll === true || rule?.review === true,
    review: full || rule?.review === true,
    manageDelegates: full || rule?.manageDelegates === true,
    manageStructure: full || rule?.manageStructure === true,
  };
}

// No consulta documentos, roles institucionales ni permisos heredados.
// El llamador debe proporcionar únicamente membresías actualmente autorizadas.
export function resolveReceptionCapabilities(input: ReceptionCapabilityInput): ReceptionCapabilities {
  const owner = input.ownerId === input.userId;
  const operational = operationalPermissions(owner ? { full: true } : input.delegate);
  const submit = input.directParticipant !== null || input.roleParticipants.length > 0;
  const peerRead = input.directParticipant !== null
    ? input.directParticipant.peerRead
    : input.roleParticipants.length > 0 && input.roleParticipants.every((rule) => rule.peerRead);
  return {
    ...operational,
    owner,
    discover: owner || submit || operationalKeys.some((key) => operational[key]),
    submit,
    peerRead,
  };
}

// La propiedad permanece inmutable; ni siquiera el propietario se autodelega.
export function canGrantReceptionDelegate(
  actor: ReceptionCapabilities,
  actorId: string,
  targetId: string,
  requested: ReceptionDelegateRule,
): boolean {
  if (actorId === targetId || !actor.manageDelegates) return false;
  const permissions = operationalPermissions(requested);
  return operationalKeys.every((key) => !permissions[key] || actor[key]);
}
