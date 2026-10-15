// Instantánea descriptiva de /batch, independiente de las acciones individuales.
// Los endpoints conservan sus comprobaciones vigentes y no aceptan estos flags.
export interface BatchActionCapabilities {
  scope: 'ordinary' | 'reception';
  update: boolean;
  trash: boolean;
  restore: boolean;
  permanentDelete: boolean;
  export: boolean;
}

export interface BatchActionContext {
  actorId: string | null;
  uploadedById: string;
  reception: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canView: boolean;
  receptionLiveSubmit: boolean;
  receptionReadable: boolean;
  workflowEditable: boolean;
  receptionActiveReview: boolean;
}

export function resolveBatchActionCapabilities(context: BatchActionContext): BatchActionCapabilities {
  const scope = context.reception ? 'reception' : 'ordinary';
  if (!context.actorId) {
    return { scope, update: false, trash: false, restore: false, permanentDelete: false, export: false };
  }
  const owner = context.actorId === context.uploadedById;
  if (context.reception) {
    const author = owner && context.receptionLiveSubmit;
    const withdraw = author && !context.receptionActiveReview;
    return {
      scope,
      update: author && context.workflowEditable,
      trash: withdraw,
      restore: withdraw,
      permanentDelete: false,
      export: context.receptionReadable,
    };
  }
  // /batch ignora rol global, workflow, archivo y caducidad de concesiones
  // ordinarias. La restauración mixta mantiene su contrato previo; estos flags
  // describen elegibilidad del registro, no validez de cada payload completo.
  return {
    scope,
    update: owner || context.canEdit,
    trash: owner || context.canDelete,
    restore: owner || context.canEdit,
    permanentDelete: owner || context.canDelete,
    export: owner || context.canView,
  };
}
