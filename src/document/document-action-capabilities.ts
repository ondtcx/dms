// Instantánea descriptiva de las acciones documentales para list/detail.
// No otorga autoridad por sí misma: cada endpoint vuelve a validar la
// operación real (bloqueos, destino y estado vigentes) al escribir.
export type DocumentActionScope = 'ordinary' | 'reception';

export interface DocumentActionCapabilities {
  editMetadata: boolean;
  editContent: boolean;
  move: boolean;
  trash: boolean;
  restore: boolean;
  permanentDelete: boolean;
  manageSharing: boolean;
  scope: DocumentActionScope;
}

export interface DocumentActionActor {
  id: string;
  // Autoridad del servicio: rol de base de datos exacto (sin normalización de
  // catálogo) comparado contra los UserRole usados por DocumentService.
  legacyServiceAdmin: boolean;
  // ADMIN, RECTOR o VICERRECTOR según el rol de base de datos exacto.
  isLegacyPrivilegedEditor: boolean;
  // Autoridad de la ruta @Roles(ADMIN), resuelta como RolesGuard con claves efectivas.
  effectiveAdminRoute: boolean;
}

// Contexto tipado ya cargado por el resolutor (sin consultas por documento).
export interface DocumentActionCapabilityContext {
  uploadedById: string;
  // null cuando el actor no existe o no puede resolverse: se niega todo.
  actor: DocumentActionActor | null;
  // Origen durable o carpeta de recepción vigente.
  reception: boolean;
  deleted: boolean;
  archived: boolean;
  // Workflow activo PENDING/IN_PROGRESS/CHANGES_REQUESTED.
  activeBlockingWorkflow: boolean;
  // El workflow activo está en CHANGES_REQUESTED y lo inició el actor.
  changesRequestedByActor: boolean;
  // Aprobación pendiente del actor en un workflow IN_PROGRESS/PENDING.
  hasPendingApproval: boolean;
  // Resultado ya resuelto de canManageDocumentSharing + puerta de recepción.
  manageSharing: boolean;
  canEditMetadata?: boolean;
  canUploadVersion?: boolean;
  // Participación viva (submit) en la recepción de origen.
  receptionLiveSubmit: boolean;
  // Revisión activa no terminal (incluye DRAFT) que impide retirar o mover.
  receptionActiveReview: boolean;
}

const DENIED: Omit<DocumentActionCapabilities, 'scope'> = {
  editMetadata: false,
  editContent: false,
  move: false,
  trash: false,
  restore: false,
  permanentDelete: false,
  manageSharing: false,
};

// La recepción fuerza el rol a USER: ni el administrador omite el candado de
// workflow, la autoría inmutable o la participación viva.
function resolveReceptionCapabilities(
  context: DocumentActionCapabilityContext,
  actor: DocumentActionActor,
  isUploader: boolean,
): DocumentActionCapabilities {
  const workflowEditable = !context.activeBlockingWorkflow || context.changesRequestedByActor;
  const currentAuthor = isUploader && context.receptionLiveSubmit;
  const noActiveReview = !context.receptionActiveReview;
  return {
    scope: 'reception',
    editMetadata: currentAuthor && workflowEditable && !context.deleted,
    editContent: currentAuthor && workflowEditable && !context.deleted,
    move: currentAuthor && noActiveReview && !context.deleted && !context.archived,
    trash: currentAuthor && noActiveReview && !context.deleted,
    restore: currentAuthor && noActiveReview && context.deleted,
    // Solo el autor con participación viva y sin revisión puede eliminar.
    permanentDelete: currentAuthor && noActiveReview,
    // La lectura de recepción nunca concede compartir.
    manageSharing: false,
  };
}

function resolveOrdinaryCapabilities(
  context: DocumentActionCapabilityContext,
  actor: DocumentActionActor,
  isUploader: boolean,
): DocumentActionCapabilities {
  // Ningún rol global omite el candado de workflow ni sustituye la propiedad.
  const workflowEditable =
    !context.activeBlockingWorkflow || context.changesRequestedByActor;
  const roleCanEdit = isUploader || context.canEditMetadata === true;
  const contentCanEdit = isUploader || context.canUploadVersion === true;
  return {
    scope: 'ordinary',
    editMetadata: !context.deleted && workflowEditable && roleCanEdit,
    // El aprobador pendiente puede editar contenido, nunca metadata.
    editContent: !context.deleted && workflowEditable && (contentCanEdit || context.hasPendingApproval),
    move: !context.deleted && !context.archived && roleCanEdit,
    trash: !context.deleted && isUploader,
    restore: context.deleted && isUploader,
    // La eliminación nunca se hereda ni se delega.
    permanentDelete: isUploader,
    manageSharing: !context.deleted && context.manageSharing,
  };
}

export function resolveDocumentActionCapabilities(
  context: DocumentActionCapabilityContext,
): DocumentActionCapabilities {
  const scope: DocumentActionScope = context.reception ? 'reception' : 'ordinary';
  const actor = context.actor;
  if (!actor || !actor.id) return { ...DENIED, scope };
  const isUploader = actor.id === context.uploadedById;
  return context.reception
    ? resolveReceptionCapabilities(context, actor, isUploader)
    : resolveOrdinaryCapabilities(context, actor, isUploader);
}
