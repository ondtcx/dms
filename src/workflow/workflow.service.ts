import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkflowAssignmentStatus,
  WorkflowEventType,
  WorkflowStatus,
  WorkflowTransitionAction,
} from '@prisma/client';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { DirectoryService, DocumentReceptionScope } from '../directory/directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { CreateWorkflowVersionDto } from './dto/create-workflow-version.dto';
import { ReassignWorkflowAssignmentDto } from './dto/reassign-workflow-assignment.dto';
import { UpdateWorkflowDefinitionMetadataDto } from './dto/update-workflow-definition-metadata.dto';
import { ValidateWorkflowVersionDto } from './dto/validate-workflow-version.dto';
import { StartWorkflowDto } from './dto/start-workflow.dto';
import { WorkflowTransitionDto } from './dto/workflow-transition.dto';
import { WorkflowEvents, WorkflowDomainEvent } from './workflow-events';
import { WorkflowPolicyService } from './workflow-policy.service';
import { resolveWorkflowActionCapabilities, WorkflowReadbackVersion } from './workflow-action-capabilities';

const WORKFLOW_INCLUDE = {
  definitionVersion: { include: { stages: { orderBy: { order: 'asc' } } } },
  assignments: { include: { stageDefinition: true }, orderBy: { id: 'asc' } },
  transitions: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { occurredAt: 'asc' } },
} as const;

type ApplicableWorkflowDefinition = {
  id: number;
  name: string;
  description: string | null;
  categoryId: number | null;
  allowedInitiatorRoles: string[];
  isActive: boolean;
  versions: Array<{
    id: number;
    templateId: number;
    version: number;
    isActive: boolean;
    publishedAt: Date | null;
    snapshot: Record<string, unknown>;
    stages: Array<{ id: number; order: number; roleKey: string }>;
  }>;
};

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly policy: WorkflowPolicyService = new WorkflowPolicyService(authorization),
    private readonly events: WorkflowEvents = new WorkflowEvents(),
    private readonly directory: DirectoryService = new DirectoryService(prisma),
  ) {}

  // Resuelve el alcance de recepción con el cliente indicado. Un documento sin
  // ubicación de recepción o carpeta ordinaria devuelve un marcador neutro y
  // conserva el contrato ordinario de workflow.
  private async resolveReceptionScope(
    document: { directoryId?: number | null; receptionOriginDirectoryId?: number | null } | null | undefined,
    actorId: string,
    db: Prisma.TransactionClient = this.prisma as unknown as Prisma.TransactionClient,
  ): Promise<DocumentReceptionScope> {
    const directoryId = document?.receptionOriginDirectoryId ?? document?.directoryId;
    if (directoryId == null) return { reception: false, directoryId: null, capabilities: null, actorId: null, actorRole: null };
    return this.directory.resolveDocumentReceptionScope(db, document as any, actorId);
  }

  // Bloquea en un orden consistente (Documento y luego Workflow/asignación) dentro
  // de la transacción Serializable antes de releer y escribir la autoridad.
  private async lockReceptionAuthority(
    tx: Prisma.TransactionClient,
    documentId: number,
    workflowId?: number,
    assignmentId?: number,
  ): Promise<void> {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Document" WHERE id = ${documentId} FOR UPDATE`);
    if (workflowId != null) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "DocumentWorkflow" WHERE id = ${workflowId} FOR UPDATE`);
    }
    if (assignmentId != null) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "WorkflowAssignment" WHERE id = ${assignmentId} FOR UPDATE`);
    }
  }

  // El rol efectivo para la restricción de iniciador usa el rol de base de datos
  // vigente en recepción; en carpetas ordinarias se conserva el rol del llamador.
  private effectiveInitiatorRole(scope: DocumentReceptionScope, callerRole: string): string {
    return scope.reception ? (scope.actorRole ?? callerRole) : callerRole;
  }

  // Predicado único de revisor de recepción: alcance vivo, capacidad de revisión
  // (que implica lectura), elegibilidad de etapa y permiso de acción de la etapa
  // (la etapa es unánime, por lo que el revisor debe poder aprobar). No concede
  // permisos que el actor no posea.
  private async isEligibleReceptionReviewer(
    db: Prisma.TransactionClient,
    document: any,
    userId: string,
    stageRoleKey: string,
  ): Promise<boolean> {
    const scope = await this.directory.resolveDocumentReceptionScope(db, document, userId);
    if (!scope.reception) return false;
    if (!scope.capabilities?.review || !scope.capabilities?.readAll) return false;
    const eligible = await db.user.findFirst({
      where: { id: userId, OR: [{ role: stageRoleKey }, { roleAssignments: { some: { role: { key: stageRoleKey, isActive: true } } } }] },
      select: { id: true },
    } as any);
    if (!eligible) return false;
    return this.authorization.hasPermission(userId, 'workflow.approve', db);
  }

  async findDefinitions() {
    return this.prisma.workflowTemplate.findMany({
      include: { versions: { include: { stages: { orderBy: { order: 'asc' } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async findDefinition(id: number) {
    const definition = await this.prisma.workflowTemplate.findUnique({
      where: { id },
      include: {
        versions: { include: { stages: { orderBy: { order: 'asc' } } }, orderBy: { version: 'asc' } },
        _count: { select: { versions: true, workflows: true } },
      },
    });
    if (!definition) throw new NotFoundException('Definición de workflow no encontrada');
    return {
      ...definition,
      counts: {
        versions: definition._count.versions,
        executions: definition._count.workflows,
        usage: definition._count.workflows,
        executionHistory: definition._count.workflows,
      },
      usage: { executionCount: definition._count.workflows, activeCount: null },
      history: null,
    };
  }

  async updateMetadata(id: number, dto: UpdateWorkflowDefinitionMetadataDto) {
    const definition = await this.prisma.workflowTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!definition) throw new NotFoundException('Definición de workflow no encontrada');
    return this.prisma.workflowTemplate.update({ where: { id }, data: dto });
  }

  async validateVersion(templateId: number, versionId: number, _dto: ValidateWorkflowVersionDto) {
    const version = await this.prisma.workflowTemplateVersion.findFirst({
      where: { id: versionId, templateId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!version) throw new NotFoundException('Versión de workflow no encontrada');
    const issues: Array<{ path: string; message: string; code: string }> = [];
    try { this.validateStages(version.stages); } catch (error) {
      issues.push({ path: 'stages', message: (error as BadRequestException).message, code: 'INVALID_STAGES' });
    }
    return { versionId, valid: issues.length === 0, issues };
  }

  async findApplicableDefinitions(
    documentId: number,
    userId: string,
    userRole: string,
  ): Promise<ApplicableWorkflowDefinition[]> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        categoryId: true,
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
        workflow: { where: { active: true }, select: { id: true } },
      },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    const scope = await this.resolveReceptionScope(document, userId);
    if (scope.reception) await this.directory.assertReceptionRead(this.prisma as unknown as Prisma.TransactionClient, document.id, scope);
    const effectiveRole = this.effectiveInitiatorRole(scope, userRole);
    await this.policy.assertStart(userId, effectiveRole, document, [], scope.reception ? scope.capabilities : null);
    if (document.workflow.length) return [];

    const definitions = await this.prisma.workflowTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ categoryId: null }, { categoryId: document.categoryId }],
        versions: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
        description: true,
        categoryId: true,
        allowedInitiatorRoles: true,
        isActive: true,
        versions: {
          where: { isActive: true },
          orderBy: [{ version: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            templateId: true,
            version: true,
            isActive: true,
            publishedAt: true,
            snapshot: true,
            stages: {
              orderBy: [{ order: 'asc' }, { id: 'asc' }],
              select: { id: true, order: true, roleKey: true },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return definitions
      .map((definition) => ({
        ...definition,
        allowedInitiatorRoles: this.normalizeAllowedInitiatorRoles(definition.allowedInitiatorRoles),
        versions: definition.versions
          .filter((version) => version.isActive)
          .map((version) => ({
            ...version,
            snapshot: version.snapshot as Record<string, unknown>,
            stages: [...version.stages].sort((left, right) => left.order - right.order || left.id - right.id),
          }))
          .sort((left, right) => left.version - right.version || left.id - right.id),
      }))
      .filter((definition) =>
        definition.isActive &&
        this.isCategoryCompatible(definition.categoryId, document.categoryId) &&
        definition.versions.length > 0 &&
        this.policy.isInitiatorRoleAllowed(effectiveRole, definition.allowedInitiatorRoles, scope.reception ? scope.capabilities : null),
      )
      .sort((left, right) => left.name.localeCompare(right.name, 'en') || left.id - right.id);
  }

  async createDefinition(dto: CreateWorkflowDefinitionDto, createdById: string) {
    this.validateStages(dto.stages);
    const snapshot = this.buildSnapshot(dto);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.workflowTemplate.create({
        data: {
          name: dto.name,
          description: dto.description,
          categoryId: dto.categoryId,
          stateDefinitions: snapshot,
          allowedInitiatorRoles: dto.allowedInitiatorRoles ?? [],
          isActive: dto.isActive ?? true,
        },
      });
      return tx.workflowTemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          snapshot,
          stages: { create: dto.stages.map((stage) => ({ order: stage.order, roleKey: stage.roleKey })) },
        },
        include: { stages: true },
      });
    });
  }

  async createVersion(templateId: number, dto: CreateWorkflowVersionDto) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!template) throw new NotFoundException('Definición de workflow no encontrada');
    let previous = template.versions[0]?.snapshot as any;
    if (dto.baseVersionId !== undefined) {
      const baseVersion = await this.prisma.workflowTemplateVersion.findFirst({
        where: { id: dto.baseVersionId, templateId },
        select: { snapshot: true },
      });
      if (!baseVersion) throw new NotFoundException('Versión base de workflow no encontrada');
      previous = baseVersion.snapshot as any;
    }
    const stages = dto.stages ?? previous?.stages;
    if (!stages?.length) throw new BadRequestException('La versión debe incluir etapas');
    this.validateStages(stages);
    const snapshot = this.buildSnapshot({ ...dto, name: dto.name ?? template.name, stages });
    return this.prisma.$transaction(async (tx) => {
      const version = (template.versions[0]?.version ?? 0) + 1;
      return tx.workflowTemplateVersion.create({
        data: {
          templateId,
          version,
          snapshot,
          stages: { create: stages.map((stage) => ({ order: stage.order, roleKey: stage.roleKey })) },
        },
        include: { stages: true },
      });
    });
  }

  async activate(templateId: number, versionId: number) {
    await this.assertVersionBelongsToTemplate(templateId, versionId);
    return this.prisma.$transaction(async (tx) => {
      await tx.workflowTemplateVersion.updateMany({ where: { templateId }, data: { isActive: false } });
      await tx.workflowTemplate.update({ where: { id: templateId }, data: { isActive: true } });
      return tx.workflowTemplateVersion.update({
        where: { id: versionId },
        data: { isActive: true, publishedAt: new Date() },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
    });
  }

  async deactivate(templateId: number, versionId: number) {
    await this.assertVersionBelongsToTemplate(templateId, versionId);
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.workflowTemplateVersion.update({
        where: { id: versionId }, data: { isActive: false },
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      const active = await tx.workflowTemplateVersion.count({ where: { templateId, isActive: true } });
      await tx.workflowTemplate.update({ where: { id: templateId }, data: { isActive: active > 0 } });
      return version;
    });
  }

  private async assertVersionBelongsToTemplate(templateId: number, versionId: number) {
    const version = await this.prisma.workflowTemplateVersion.findFirst({ where: { id: versionId, templateId }, select: { id: true } });
    if (!version) throw new NotFoundException('Versión de workflow no encontrada');
  }

  async start(documentId: number, dto: StartWorkflowDto, userId: string, userRole: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, workflow: { where: { active: true } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    if (document.workflow.length) throw new ConflictException('El documento ya tiene un workflow activo');

    const version = await this.resolveVersion(dto.versionId);
    const scope = await this.resolveReceptionScope(document, userId);
    const allowedRoles = this.normalizeAllowedInitiatorRoles(version.template.allowedInitiatorRoles);
    // El autor de una recepción debe ser el autor vivo y participante; la
    // capacidad de revisión no es requisito para iniciar ni reenviar.
    if (scope.reception) await this.directory.assertDocumentMutation(this.prisma as unknown as Prisma.TransactionClient, document, userId, 'edit');
    await this.policy.assertStart(userId, this.effectiveInitiatorRole(scope, userRole), document, allowedRoles, scope.reception ? scope.capabilities : null);
    if (!this.isCategoryCompatible(version.template.categoryId, document.categoryId)) {
      throw new BadRequestException('El workflow no aplica a la categoría del documento');
    }
    const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // La autoridad se relee SIEMPRE dentro de la transacción, con independencia
        // de la clasificación previa: tanto el documento como la definición pueden
        // cambiar entre la comprobación previa y la escritura final.
        await this.lockReceptionAuthority(tx, documentId);
        const lockedDocument = await tx.document.findUnique({
          where: { id: documentId },
          select: { id: true, uploadedById: true, categoryId: true, directoryId: true, receptionOriginDirectoryId: true },
        });
        if (!lockedDocument) throw new NotFoundException('Documento no encontrado');
        const activeExecution = await tx.documentWorkflow.findFirst({ where: { documentId, active: true }, select: { id: true } });
        if (activeExecution) throw new ConflictException('El documento ya tiene un workflow activo');
        // Relee la definición vigente completa con el cliente de transacción: no se
        // confían allowedInitiatorRoles, categoría ni activación cacheadas. Se conserva
        // la identidad de la versión seleccionada; nunca se cambia de definición en silencio.
        const lockedVersion = await tx.workflowTemplateVersion.findUnique({
          where: { id: version.id },
          include: { template: true, stages: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } },
        });
        if (!lockedVersion || lockedVersion.templateId !== version.templateId || !lockedVersion.isActive || !lockedVersion.template.isActive) {
          throw new BadRequestException('No existe una versión activa de workflow');
        }
        if (!this.isCategoryCompatible(lockedVersion.template.categoryId, lockedDocument.categoryId)) {
          throw new BadRequestException('El workflow no aplica a la categoría del documento');
        }
        const currentAllowedRoles = this.normalizeAllowedInitiatorRoles(lockedVersion.template.allowedInitiatorRoles);
        const lockedScope = await this.resolveReceptionScope(lockedDocument, userId, tx);
        const lockedStage = lockedVersion.stages[0];
        if (!lockedStage) throw new BadRequestException('El workflow debe tener al menos una etapa');
        if (lockedScope.reception) await this.directory.assertDocumentMutation(tx, lockedDocument, userId, 'edit');
        await this.policy.assertStart(userId, this.effectiveInitiatorRole(lockedScope, userRole), lockedDocument, currentAllowedRoles, lockedScope.reception ? lockedScope.capabilities : null, tx);
        const assignments = lockedScope.reception
          ? await this.resolveAssignments(lockedVersion.stages, { document: lockedDocument, initiatorId: userId }, tx)
          : await this.resolveAssignments(lockedVersion.stages, null, tx);
        const execution = await tx.documentWorkflow.create({
          data: {
            documentId,
            templateId: lockedVersion.templateId,
            definitionVersionId: lockedVersion.id,
            snapshot: lockedVersion.snapshot,
            documentVersionId: document.versions[0]?.id,
            active: true,
            status: WorkflowStatus.PENDING,
            currentState: lockedStage.roleKey,
            currentStateOrder: lockedStage.order,
            initiatedById: userId,
          },
        });
        await tx.workflowAssignment.createMany({
          data: assignments.map((assignment) => ({ ...assignment, workflowId: execution.id })),
        });
        await tx.workflowEvent.create({
          data: {
            workflowId: execution.id,
            type: WorkflowEventType.STARTED,
            payload: { comment: dto.comment ?? null, initiatedById: userId },
          },
        });
        return tx.documentWorkflow.findUnique({ where: { id: execution.id }, include: WORKFLOW_INCLUDE });
      }, options);
      this.events.publish({ workflowId: result.id, type: WorkflowEventType.STARTED, payload: { initiatedById: userId } });
      return result;
    } catch (error) {
      if ((error as any)?.code === 'P2002') throw new ConflictException('El documento ya tiene un workflow activo');
      if ((error as any)?.code === 'P2034') throw new ConflictException('El workflow cambió durante la operación. Vuelve a intentarlo');
      throw error;
    }
  }

  async history(documentId: number, userId: string, userRole: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        uploadedById: true,
        directoryId: true,
        receptionOriginDirectoryId: true,
        currentVersion: true,
        versions: {
          select: { id: true, documentId: true, version: true, source: true, workflowId: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
        workflow: { select: { assignments: { select: { userId: true } } } },
      },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    const scope = await this.resolveReceptionScope(document, userId);
    // Sin acceso de lectura vigente no se expone ningún metadato de workflow.
    if (scope.reception) await this.directory.assertReceptionRead(this.prisma as unknown as Prisma.TransactionClient, document.id, scope);
    await this.policy.assertHistory(userId, userRole, document, scope.reception ? scope.capabilities : null);
    const workflows = await this.prisma.documentWorkflow.findMany({ where: { documentId }, include: WORKFLOW_INCLUDE, orderBy: { createdAt: 'desc' } });
    if (!workflows.length) return workflows;
    const versionIds = [...new Set(workflows.map((workflow) => workflow.documentVersionId)
      .filter((id): id is number => Number.isSafeInteger(id) && id > 0))];
    const versions = versionIds.length ? await this.prisma.documentVersion.findMany({
      where: { documentId, id: { in: versionIds } },
      select: { id: true, documentId: true, version: true, source: true, workflowId: true },
    }) : [];
    const reviewedVersions = new Map<number, WorkflowReadbackVersion>(versions.map((version) => [version.id, version]));
    const readPolicy = this.policy.createReadbackPolicy();
    const results = [];
    for (const workflow of workflows) {
      const actionCapabilities = await resolveWorkflowActionCapabilities(
        readPolicy, workflow, document, userId, userRole,
        scope.reception ? scope.capabilities : null, reviewedVersions, scope.reception,
      );
      results.push({ ...workflow, actionCapabilities });
    }
    return results;
  }

  async transition(workflowId: number, dto: WorkflowTransitionDto, userId: string, userRole: string) {
    const workflow = await this.getWorkflow(workflowId);
    if (workflow.legacyReadOnly) throw new BadRequestException('El workflow histórico es de solo lectura');
    const document = workflow.document;
    const scope = await this.resolveReceptionScope(document, userId);
    const isSubmit = dto.action === WorkflowTransitionAction.SUBMIT;
    const isInitiatorCancel = dto.action === WorkflowTransitionAction.CANCEL && workflow.initiatedById === userId;
    // Reenviar y cancelar como iniciador exigen autor vivo y participante; la
    // capacidad de revisión nunca sustituye esa participación.
    if (scope.reception && (isSubmit || isInitiatorCancel)) {
      await this.directory.assertDocumentMutation(this.prisma as unknown as Prisma.TransactionClient, document, userId, 'edit');
    }
    await this.policy.assertTransitionContext(dto.action, userId, userRole, workflow, dto.comment, scope.reception ? scope.capabilities : null);
    const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

    let transaction: any;
    try {
      transaction = await this.prisma.$transaction(async (tx) => {
        // Bloqueo y relectura autoritativa SIEMPRE dentro de la transacción, con
        // independencia de la clasificación previa; el alcance final decide la política.
        await this.lockReceptionAuthority(tx, workflow.documentId, workflowId);
        const wf = await tx.documentWorkflow.findUnique({
          where: { id: workflowId },
          include: { ...WORKFLOW_INCLUDE, document: { select: { id: true, uploadedById: true, directoryId: true, receptionOriginDirectoryId: true } } },
        });
        if (!wf) throw new NotFoundException('Workflow no encontrado');
        const lockedScope = await this.resolveReceptionScope(wf.document, userId, tx);
        const lockedIsInitiatorCancel = dto.action === WorkflowTransitionAction.CANCEL && wf.initiatedById === userId;
        if (isSubmit || lockedIsInitiatorCancel) {
          await this.directory.assertDocumentMutation(tx, wf.document, userId, 'edit');
        }
        await this.policy.assertTransitionContext(dto.action, userId, userRole, wf, dto.comment, lockedScope.reception ? lockedScope.capabilities : null, tx);
        const effectiveAssignments = wf.assignments.filter(
          (item: any) => item.stageDefinition.order === wf.currentStateOrder && item.status === WorkflowAssignmentStatus.PENDING,
        );
        const effectiveAssignment = wf.assignments.find(
          (item: any) => item.stageDefinition.order === wf.currentStateOrder && item.userId === userId && item.status === WorkflowAssignmentStatus.PENDING,
        );
        if (effectiveAssignment) {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM "WorkflowAssignment" WHERE id = ${effectiveAssignment.id} FOR UPDATE`);
        }
        const fromState = wf.currentState;
        const isDecision =
          dto.action === WorkflowTransitionAction.APPROVE ||
          dto.action === WorkflowTransitionAction.REQUEST_CHANGES ||
          dto.action === WorkflowTransitionAction.REJECT;
        // Con cambios solicitados el workflow espera el reenvío del autor: una
        // decisión directa sobre la corrección aún no reenviada se rechaza antes de
        // cualquier escritura, clonación o evento.
        if (isDecision && wf.status === WorkflowStatus.CHANGES_REQUESTED) {
          throw new BadRequestException('No se puede decidir mientras haya cambios solicitados sin reenviar');
        }
      let status = wf.status;
      let currentState = wf.currentState;
      let currentStateOrder = wf.currentStateOrder;
      let active = wf.active;
      let completedAt: Date | null = null;
      // La decisión se liga a la versión revisada del workflow; el reenvío referencia
      // la corrección vigente del mismo workflow. Nunca se confía en una versión
      // enviada por el cliente sin validarla contra la fila ligada.
      let reviewedVersionId: number | null = null;
      let workflowBindingVersionId: number | null = wf.documentVersionId ?? null;
      let correctionVersionId: number | null = null;

      if (dto.action === WorkflowTransitionAction.SUBMIT) {
        if (wf.initiatedById !== userId || wf.status !== WorkflowStatus.CHANGES_REQUESTED) {
          throw new BadRequestException('Solo se puede reenviar un workflow con cambios solicitados');
        }
        reviewedVersionId = await this.resolveSubmittedVersion(tx, wf, dto, lockedScope.reception);
        workflowBindingVersionId = reviewedVersionId;
        await tx.workflowAssignment.updateMany({ where: { workflowId, status: { not: WorkflowAssignmentStatus.REASSIGNED } }, data: { status: WorkflowAssignmentStatus.PENDING, completedAt: null } });
        status = WorkflowStatus.IN_PROGRESS;
      } else if (dto.action === WorkflowTransitionAction.REQUEST_CHANGES) {
        reviewedVersionId = await this.resolveDecisionReviewedVersion(tx, wf, dto, lockedScope.reception);
        const newVersion = await this.createCorrectionVersion(tx, wf, userId, reviewedVersionId);
        correctionVersionId = newVersion.id;
        workflowBindingVersionId = newVersion.id;
        status = WorkflowStatus.CHANGES_REQUESTED;
      } else if (dto.action === WorkflowTransitionAction.REJECT) {
        reviewedVersionId = await this.resolveDecisionReviewedVersion(tx, wf, dto, lockedScope.reception);
        status = WorkflowStatus.REJECTED;
        active = false;
        completedAt = new Date();
      } else if (dto.action === WorkflowTransitionAction.CANCEL) {
        reviewedVersionId = await this.resolveCancelVersion(tx, wf, dto);
        status = WorkflowStatus.CANCELLED;
        active = false;
        completedAt = new Date();
      } else if (dto.action === WorkflowTransitionAction.APPROVE) {
        reviewedVersionId = await this.resolveDecisionReviewedVersion(tx, wf, dto, lockedScope.reception);
        await tx.workflowAssignment.update({ where: { id: effectiveAssignment.id }, data: { status: WorkflowAssignmentStatus.COMPLETED, completedAt: new Date() } });
        const remaining = effectiveAssignments.filter((item: any) => item.id !== effectiveAssignment.id);
        if (!remaining.length) {
          const next = wf.definitionVersion.stages.find((stage: any) => stage.order > wf.currentStateOrder);
          if (next) {
            currentState = next.roleKey;
            currentStateOrder = next.order;
            status = WorkflowStatus.IN_PROGRESS;
          } else {
            status = WorkflowStatus.APPROVED;
            active = false;
            completedAt = new Date();
          }
        } else {
          status = WorkflowStatus.IN_PROGRESS;
        }
      }

      const eventPayload: Prisma.InputJsonObject = {
        comment: dto.comment ?? null,
        performedById: userId,
        documentVersionId: reviewedVersionId,
        ...(correctionVersionId != null ? { correctionVersionId } : {}),
      };
      await tx.workflowTransition.create({
        data: {
          workflowId,
          assignmentId: effectiveAssignment?.id,
          action: dto.action,
          fromState,
          toState: currentState,
          comment: dto.comment,
          performedById: userId,
          documentVersionId: reviewedVersionId,
        },
      });
      await tx.workflowEvent.create({
        data: {
          workflowId,
          type: this.eventType(dto.action),
          payload: eventPayload,
        },
      });
      const completed = status === WorkflowStatus.APPROVED;
      if (completed) {
        await tx.workflowEvent.create({
          data: {
            workflowId,
            type: WorkflowEventType.COMPLETED,
            payload: { performedById: userId },
          },
        });
      }
      const result = await tx.documentWorkflow.update({
        where: { id: workflowId },
        data: { status, currentState, currentStateOrder, active, completedAt, documentVersionId: workflowBindingVersionId },
        include: WORKFLOW_INCLUDE,
      });
      return { result, event: { workflowId, type: this.eventType(dto.action), payload: eventPayload }, completed };
      }, options);
    } catch (error) {
      if ((error as any)?.code === 'P2034') throw new ConflictException('El workflow cambió durante la operación. Vuelve a intentarlo');
      throw error;
    }
    this.events.publish(transaction.event as WorkflowDomainEvent);
    if (transaction.completed) this.events.publish({ workflowId, type: WorkflowEventType.COMPLETED, payload: { performedById: userId } });
    return transaction.result;
  }

  async reassign(workflowId: number, assignmentId: number, dto: ReassignWorkflowAssignmentDto, userId: string, userRole: string) {
    const [workflow, target] = await Promise.all([
      this.prisma.documentWorkflow.findUnique({
        where: { id: workflowId },
        include: {
          assignments: { include: { stageDefinition: true } },
          definitionVersion: { include: { stages: true } },
          document: { select: { id: true, uploadedById: true, directoryId: true, receptionOriginDirectoryId: true } },
        },
      }),
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, name: true } }),
    ]);
    if (!workflow || workflow.id !== workflowId) throw new NotFoundException('Workflow no encontrado');
    if (!target) throw new NotFoundException('Usuario de destino no encontrado');
    const assignment = workflow.assignments.find((item) => item.id === assignmentId);
    const scope = await this.resolveReceptionScope(workflow.document, userId);
    // Gestión de asignaciones sigue exigiendo el permiso vigente; en recepción se
    // añade una capacidad de revisión/gestión viva y el destino debe ser elegible.
    await this.policy.assertReassignment(userId, workflow, assignment, scope.reception ? scope.capabilities : null);
    const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
    let result: any;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Bloqueo y relectura autoritativa SIEMPRE dentro de la transacción, con
        // independencia de la clasificación previa; el alcance final decide la política.
        await this.lockReceptionAuthority(tx, workflow.documentId, workflowId, assignmentId);
        const lockedWorkflow = await tx.documentWorkflow.findUnique({
          where: { id: workflowId },
          include: {
            assignments: { include: { stageDefinition: true } },
            definitionVersion: { include: { stages: true } },
            document: { select: { id: true, uploadedById: true, directoryId: true, receptionOriginDirectoryId: true } },
          },
        });
        if (!lockedWorkflow) throw new NotFoundException('Workflow no encontrado');
        const lockedScope = await this.resolveReceptionScope(lockedWorkflow.document, userId, tx);
        const lockedAssignment = lockedWorkflow.assignments.find((item: any) => item.id === assignmentId);
        await this.policy.assertReassignment(userId, lockedWorkflow, lockedAssignment, lockedScope.reception ? lockedScope.capabilities : null, tx);
        if (lockedScope.reception) await this.assertReassignmentTarget(tx, lockedWorkflow, lockedAssignment, target.id);
        const updatedAssignment = await tx.workflowAssignment.update({
          where: { id: assignmentId },
          data: { userId: target.id, userNameSnapshot: target.name, status: WorkflowAssignmentStatus.PENDING, reassignedAt: new Date(), reassignmentReason: dto.reason },
        });
        await tx.workflowEvent.create({ data: { workflowId, type: WorkflowEventType.REASSIGNED, payload: { assignmentId, previousUserId: assignment.userId, userId: target.id, reason: dto.reason, performedById: userId } } });
        return updatedAssignment;
      }, options);
    } catch (error) {
      if ((error as any)?.code === 'P2034') throw new ConflictException('El workflow cambió durante la operación. Vuelve a intentarlo');
      throw error;
    }
    this.events.publish({ workflowId, type: WorkflowEventType.REASSIGNED, payload: { assignmentId, userId: target.id, reason: dto.reason, performedById: userId } });
    return result;
  }

  // El destino de una reasignación de recepción comparte el predicado del candidato:
  // revisión viva (que implica lectura), elegibilidad de etapa y permiso de acción de
  // la etapa; no puede ser el iniciador (autoaprobación) ni heredar la elegibilidad
  // del actor.
  private async assertReassignmentTarget(db: Prisma.TransactionClient, workflow: any, assignment: any, targetId: string) {
    if (!assignment) throw new ForbiddenException('La asignación no pertenece al workflow');
    if (targetId === workflow.initiatedById) throw new ForbiddenException('No se puede reasignar al iniciador del workflow');
    const stageOrder = assignment.stageDefinition?.order;
    const stage = workflow.definitionVersion?.stages?.find((item: any) => item.order === stageOrder);
    if (!stage) throw new BadRequestException('La etapa de la asignación no existe');
    const targetScope = await this.directory.resolveDocumentReceptionScope(db, workflow.document, targetId);
    if (!targetScope.reception || !targetScope.capabilities?.review || !targetScope.capabilities?.readAll) {
      throw new ForbiddenException('El usuario de destino necesita revisión vigente en la recepción');
    }
    const eligible = await db.user.findFirst({
      where: { id: targetId, OR: [{ role: stage.roleKey }, { roleAssignments: { some: { role: { key: stage.roleKey, isActive: true } } } }] },
      select: { id: true },
    });
    if (!eligible) throw new BadRequestException('El usuario de destino no corresponde a la etapa');
    if (!(await this.authorization.hasPermission(targetId, 'workflow.approve', db))) {
      throw new ForbiddenException('El usuario de destino no puede aprobar la etapa de recepción');
    }
  }

  private async resolveVersion(versionId?: number): Promise<any> {
    const version = await this.prisma.workflowTemplateVersion.findFirst({
      where: versionId ? { id: versionId, isActive: true } : { isActive: true },
      include: { template: true, stages: { orderBy: { order: 'asc' } } },
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
    });
    if (!version || !version.template.isActive) throw new BadRequestException('No existe una versión activa de workflow');
    return version;
  }

  private normalizeAllowedInitiatorRoles(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((role): role is string => typeof role === 'string') : [];
  }

  private isCategoryCompatible(templateCategoryId: number | null | undefined, documentCategoryId: number | null | undefined) {
    return templateCategoryId == null || templateCategoryId === documentCategoryId;
  }

  private async resolveAssignments(
    stages: any[],
    reception?: { document: any; initiatorId: string } | null,
    db: Prisma.TransactionClient = this.prisma as unknown as Prisma.TransactionClient,
  ) {
    const result: any[] = [];
    for (const stage of stages) {
      const users = await db.user.findMany({
        where: { OR: [{ role: stage.roleKey }, { roleAssignments: { some: { role: { key: stage.roleKey, isActive: true } } } }] },
        select: { id: true, name: true, role: true },
      } as any);
      if (!users.length) throw new BadRequestException(`No hay usuarios asignables para el rol ${stage.roleKey}`);
      let candidates = users as any[];
      if (reception) {
        // En recepción el candidato automático debe tener capacidad viva de revisión
        // (revisión y lectura), corresponder a la etapa y poder aprobar la etapa; no
        // puede ser el iniciador (autoaprobación). Sin candidato elegible se falla de
        // forma explícita, nunca con un fallback global.
        candidates = [];
        for (const user of users as any[]) {
          if (user.id === reception.initiatorId) continue;
          if (!(await this.isEligibleReceptionReviewer(db, reception.document, user.id, stage.roleKey))) continue;
          candidates.push(user);
        }
        if (!candidates.length) throw new BadRequestException(`No hay revisores de recepción elegibles para la etapa ${stage.roleKey}`);
      }
      result.push(...candidates.map((user: any) => ({ stageDefinitionId: stage.id, userId: user.id, userNameSnapshot: user.name, roleKeySnapshot: stage.roleKey })));
    }
    return result;
  }

  private async getWorkflow(id: number): Promise<any> {
    const workflow = await this.prisma.documentWorkflow.findUnique({
      where: { id },
      include: { ...WORKFLOW_INCLUDE, document: { select: { id: true, uploadedById: true, directoryId: true, receptionOriginDirectoryId: true } } },
    });
    if (!workflow) throw new NotFoundException('Workflow no encontrado');
    return workflow;
  }

  // Valida y resuelve la versión revisada de una decisión de revisión. En recepción
  // la versión es explícita, entera positiva y debe coincidir con la versión ligada
  // del workflow. En carpetas ordinarias la omisión heredada se liga a la versión
  // revisada, pero una versión enviada forjada, desincronizada o ajena se rechaza. Si
  // la fila ligada no existe o no pertenece al documento se falla cerrado sin
  // retroceder nunca a la última versión.
  private async resolveDecisionReviewedVersion(
    tx: Prisma.TransactionClient,
    workflow: any,
    dto: WorkflowTransitionDto,
    reception: boolean,
  ): Promise<number | null> {
    const bound = workflow.documentVersionId ?? null;
    const supplied = dto.versionId;
    if (reception) {
      if (!Number.isInteger(supplied) || (supplied as number) <= 0) {
        throw new BadRequestException('Debes indicar la versión revisada explícita de la recepción');
      }
      if (bound == null || supplied !== bound) {
        throw new BadRequestException('La versión revisada no corresponde a la versión ligada del workflow');
      }
    } else if (supplied == null) {
      // Omisión heredada: se conserva la versión ligada del workflow sin reconsultar.
      return bound;
    } else if (!Number.isInteger(supplied) || (supplied as number) <= 0 || bound == null || supplied !== bound) {
      throw new BadRequestException('La versión indicada no corresponde a la versión ligada del workflow');
    }
    const reviewed = await tx.documentVersion.findFirst({
      where: { id: bound as number, documentId: workflow.documentId },
      select: { id: true },
    });
    if (!reviewed) {
      throw new BadRequestException('La versión revisada no pertenece al documento');
    }
    return reviewed.id;
  }

  // La cancelación no exige una versión explícita, pero nunca persiste una versión
  // ajena como procedencia: si el cliente envía una versión, debe ser entera positiva
  // y coincidir con la versión ligada del documento. La evidencia usa la versión ligada.
  private async resolveCancelVersion(
    tx: Prisma.TransactionClient,
    workflow: any,
    dto: WorkflowTransitionDto,
  ): Promise<number | null> {
    const bound = workflow.documentVersionId ?? null;
    const supplied = dto.versionId;
    if (supplied != null) {
      if (!Number.isInteger(supplied) || (supplied as number) <= 0 || bound == null || supplied !== bound) {
        throw new BadRequestException('La versión indicada no corresponde a la versión ligada del workflow');
      }
    }
    if (bound == null) return null;
    const reviewed = await tx.documentVersion.findFirst({
      where: { id: bound, documentId: workflow.documentId },
      select: { id: true },
    });
    if (!reviewed) {
      throw new BadRequestException('La versión revisada no pertenece al documento');
    }
    return reviewed.id;
  }

  // Resuelve la versión reenviada. En recepción debe ser la corrección vigente del
  // MISMO workflow (fuente CAMBIOS_SOLICITADOS y workflow ligado) y coincidir con la
  // versión ligada actual; una versión ajena, antigua o no-corrección se rechaza. En
  // carpetas ordinarias se conserva el contrato: la versión debe pertenecer al documento.
  private async resolveSubmittedVersion(
    tx: Prisma.TransactionClient,
    workflow: any,
    dto: WorkflowTransitionDto,
    reception: boolean,
  ): Promise<number> {
    const supplied = dto.versionId;
    if (!Number.isInteger(supplied) || (supplied as number) <= 0) {
      throw new BadRequestException('Debes indicar la versión corregida para reenviar el workflow');
    }
    if (reception) {
      const correction = await tx.documentVersion.findFirst({
        where: {
          id: supplied as number,
          documentId: workflow.documentId,
          source: 'CAMBIOS_SOLICITADOS',
          workflowId: workflow.id,
        },
        select: { id: true },
      });
      if (!correction || correction.id !== workflow.documentVersionId) {
        throw new BadRequestException('La versión reenviada no es la corrección vigente del workflow');
      }
      return correction.id;
    }
    const submittedVersion = await tx.documentVersion.findFirst({
      where: { id: supplied as number, documentId: workflow.documentId },
      select: { id: true },
    });
    if (!submittedVersion) throw new BadRequestException('La versión corregida no pertenece al documento');
    return submittedVersion.id;
  }

  // La corrección se clona SIEMPRE desde la fila revisada validada del mismo documento;
  // nunca desde una versión enviada por el cliente ni desde otro documento. La nueva
  // fila pasa a ser la versión vigente dentro de la MISMA transacción para que las
  // asignaciones posteriores del autor (currentVersion + 1) no colisionen con el índice
  // único (documentId, version). Si la versión revisada no es la vigente más reciente,
  // existe contenido posterior no revisado y se falla cerrado en lugar de retrocederlo.
  private async createCorrectionVersion(tx: any, workflow: any, userId: string, reviewedVersionId: number | null) {
    const source = reviewedVersionId != null
      ? await tx.documentVersion.findFirst({ where: { id: reviewedVersionId, documentId: workflow.documentId } })
      : null;
    if (!source || source.documentId !== workflow.documentId) throw new BadRequestException('La versión revisada no pertenece al documento');
    const document = await tx.document.findUnique({
      where: { id: workflow.documentId },
      select: { currentVersion: true, checksumSHA256: true },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    const aggregate = await tx.documentVersion.aggregate({ where: { documentId: source.documentId }, _max: { version: true } });
    const maxVersion = aggregate._max.version ?? 0;
    // La fuente revisada debe ser la versión vigente y la más reciente; si no, hay
    // contenido posterior no revisado y no se puede convertirlo en actual sin
    // retrocederlo en silencio.
    if (document.currentVersion !== source.version || maxVersion !== document.currentVersion) {
      throw new ConflictException('El documento cambió después de la revisión; no se puede ligar la corrección');
    }
    const nextVersion = document.currentVersion + 1;
    const correction = await tx.documentVersion.create({
      data: {
        documentId: source.documentId,
        version: nextVersion,
        filename: source.filename,
        mimetype: source.mimetype,
        storedName: source.storedName,
        path: source.path,
        size: source.size,
        checksumSHA256: source.checksumSHA256,
        // La corrección clona los bytes de la versión revisada: conserva su recuento.
        pageCount: source.pageCount,
        comment: 'Nueva versión solicitada por el workflow',
        createdById: userId,
        source: 'CAMBIOS_SOLICITADOS',
        workflowId: workflow.id,
      },
    });
    // La versión revisada conserva sus bytes y ruta; solo se fecha su sustitución y
    // queda protegida por las referencias de workflow/transición existentes.
    await tx.documentVersion.update({ where: { id: source.id }, data: { supersededAt: new Date() } });
    // La corrección clonada pasa a ser la fila vigente: el contador y el checksum
    // vigente se alinean con la nueva versión para que la numeración posterior sea
    // coherente dentro y fuera de la transacción.
    await tx.document.update({
      where: { id: workflow.documentId },
      data: { currentVersion: correction.version, checksumSHA256: source.checksumSHA256 },
    });
    return correction;
  }

  private eventType(action: WorkflowTransitionAction): WorkflowEventType {
    const map: Record<string, WorkflowEventType> = {
      [WorkflowTransitionAction.SUBMIT]: WorkflowEventType.SUBMITTED,
      [WorkflowTransitionAction.APPROVE]: WorkflowEventType.APPROVED,
      [WorkflowTransitionAction.REQUEST_CHANGES]: WorkflowEventType.CHANGES_REQUESTED,
      [WorkflowTransitionAction.REJECT]: WorkflowEventType.REJECTED,
      [WorkflowTransitionAction.CANCEL]: WorkflowEventType.CANCELLED,
    };
    return map[action];
  }

  private validateStages(stages: any[]) {
    if (!stages.length) throw new BadRequestException('El workflow debe tener al menos una etapa');
    const orders = stages.map((stage) => stage.order).sort((a, b) => a - b);
    if (orders.some((order, index) => order !== index + 1)) throw new BadRequestException('Las etapas deben ser secuenciales');
    if (stages.some((stage) => !stage.roleKey?.trim())) throw new BadRequestException('Cada etapa requiere un rol');
  }

  private buildSnapshot(dto: any) {
    return {
      name: dto.name,
      description: dto.description ?? null,
      categoryId: dto.categoryId ?? null,
      stages: dto.stages.map((stage: any) => ({ order: stage.order, roleKey: stage.roleKey, executionMode: 'SEQUENTIAL', completionRule: 'UNANIMOUS' })),
      allowedInitiatorRoles: dto.allowedInitiatorRoles ?? [],
    };
  }
}
