import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WorkflowAssignmentStatus,
  WorkflowEventType,
  WorkflowStatus,
  WorkflowTransitionAction,
} from '@prisma/client';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { CreateWorkflowVersionDto } from './dto/create-workflow-version.dto';
import { ReassignWorkflowAssignmentDto } from './dto/reassign-workflow-assignment.dto';
import { StartWorkflowDto } from './dto/start-workflow.dto';
import { WorkflowTransitionDto } from './dto/workflow-transition.dto';
import { WorkflowEvents, WorkflowDomainEvent } from './workflow-events';
import { WorkflowPolicyService } from './workflow-policy.service';

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
  ) {}

  async findDefinitions() {
    return this.prisma.workflowTemplate.findMany({
      include: { versions: { include: { stages: { orderBy: { order: 'asc' } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async findApplicableDefinitions(
    documentId: number,
    userId: string,
    userRole: string,
  ): Promise<ApplicableWorkflowDefinition[]> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        categoryId: true,
        uploadedById: true,
        workflow: { where: { active: true }, select: { id: true } },
      },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    await this.policy.assertStart(userId, userRole, document, []);
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
        this.policy.isInitiatorRoleAllowed(userRole, definition.allowedInitiatorRoles),
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
    const previous = template.versions[0]?.snapshot as any;
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

  async activate(templateId: number) {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!template || !template.versions[0]) throw new NotFoundException('Versión de workflow no encontrada');
    const versionId = template.versions[0].id;
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

  async start(documentId: number, dto: StartWorkflowDto, userId: string, userRole: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, workflow: { where: { active: true } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    if (document.workflow.length) throw new ConflictException('El documento ya tiene un workflow activo');

    const version = await this.resolveVersion(dto.versionId);
    await this.policy.assertStart(
      userId,
      userRole,
      document,
      this.normalizeAllowedInitiatorRoles(version.template.allowedInitiatorRoles),
    );
    if (!this.isCategoryCompatible(version.template.categoryId, document.categoryId)) {
      throw new BadRequestException('El workflow no aplica a la categoría del documento');
    }
    const assignments = await this.resolveAssignments(version.stages);
    const firstStage = version.stages[0];
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const execution = await tx.documentWorkflow.create({
          data: {
            documentId,
            templateId: version.templateId,
            definitionVersionId: version.id,
            snapshot: version.snapshot,
            documentVersionId: document.versions[0]?.id,
            active: true,
            status: WorkflowStatus.PENDING,
            currentState: firstStage.roleKey,
            currentStateOrder: firstStage.order,
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
      });
      this.events.publish({ workflowId: result.id, type: WorkflowEventType.STARTED, payload: { initiatedById: userId } });
      return result;
    } catch (error) {
      if ((error as any)?.code === 'P2002') throw new ConflictException('El documento ya tiene un workflow activo');
      throw error;
    }
  }

  async history(documentId: number, userId: string, userRole: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { uploadedById: true, workflow: { select: { assignments: { select: { userId: true } } } } },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    await this.policy.assertHistory(userId, userRole, document);
    return this.prisma.documentWorkflow.findMany({ where: { documentId }, include: WORKFLOW_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async transition(workflowId: number, dto: WorkflowTransitionDto, userId: string, userRole: string) {
    const workflow = await this.getWorkflow(workflowId);
    if (workflow.legacyReadOnly) throw new BadRequestException('El workflow histórico es de solo lectura');
    await this.policy.assertTransitionContext(dto.action, userId, userRole, workflow, dto.comment);
    const currentAssignments = workflow.assignments.filter(
      (assignment) => assignment.stageDefinition.order === workflow.currentStateOrder && assignment.status === WorkflowAssignmentStatus.PENDING,
    );
    const isInitiator = workflow.initiatedById === userId;
    const assignment = workflow.assignments.find(
      (item) => item.stageDefinition.order === workflow.currentStateOrder && item.userId === userId && item.status === WorkflowAssignmentStatus.PENDING,
    );

    const transaction = await this.prisma.$transaction(async (tx) => {
      const fromState = workflow.currentState;
      let status = workflow.status;
      let currentState = workflow.currentState;
      let currentStateOrder = workflow.currentStateOrder;
      let active = workflow.active;
      let completedAt: Date | null = null;
      let documentVersionId = dto.versionId ?? workflow.documentVersionId;

      if (dto.action === WorkflowTransitionAction.SUBMIT) {
        if (!isInitiator || workflow.status !== WorkflowStatus.CHANGES_REQUESTED) {
          throw new BadRequestException('Solo se puede reenviar un workflow con cambios solicitados');
        }
        if (!dto.versionId) throw new BadRequestException('Debes indicar la versión corregida para reenviar el workflow');
        const submittedVersion = await tx.documentVersion.findFirst({
          where: { id: dto.versionId, documentId: workflow.documentId },
          select: { id: true },
        });
        if (!submittedVersion) throw new BadRequestException('La versión corregida no pertenece al documento');
        await tx.workflowAssignment.updateMany({ where: { workflowId, status: { not: WorkflowAssignmentStatus.REASSIGNED } }, data: { status: WorkflowAssignmentStatus.PENDING, completedAt: null } });
        status = WorkflowStatus.IN_PROGRESS;
      } else if (dto.action === WorkflowTransitionAction.REQUEST_CHANGES) {
        const newVersion = await this.createCorrectionVersion(tx, workflow, userId, dto.versionId);
        documentVersionId = newVersion.id;
        status = WorkflowStatus.CHANGES_REQUESTED;
        await tx.documentWorkflow.update({ where: { id: workflowId }, data: { documentVersionId } });
      } else if (dto.action === WorkflowTransitionAction.REJECT) {
        status = WorkflowStatus.REJECTED;
        active = false;
        completedAt = new Date();
      } else if (dto.action === WorkflowTransitionAction.CANCEL) {
        status = WorkflowStatus.CANCELLED;
        active = false;
        completedAt = new Date();
      } else if (dto.action === WorkflowTransitionAction.APPROVE) {
        await tx.workflowAssignment.update({ where: { id: assignment.id }, data: { status: WorkflowAssignmentStatus.COMPLETED, completedAt: new Date() } });
        const remaining = currentAssignments.filter((item) => item.id !== assignment.id);
        if (!remaining.length) {
          const next = workflow.definitionVersion.stages.find((stage) => stage.order > workflow.currentStateOrder);
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

      await tx.workflowTransition.create({
        data: {
          workflowId,
          assignmentId: assignment?.id,
          action: dto.action,
          fromState,
          toState: currentState,
          comment: dto.comment,
          performedById: userId,
          documentVersionId,
        },
      });
      await tx.workflowEvent.create({
        data: {
          workflowId,
          type: this.eventType(dto.action),
          payload: { comment: dto.comment ?? null, performedById: userId, documentVersionId },
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
        data: { status, currentState, currentStateOrder, active, completedAt, documentVersionId },
        include: WORKFLOW_INCLUDE,
      });
      return { result, event: { workflowId, type: this.eventType(dto.action), payload: { comment: dto.comment ?? null, performedById: userId, documentVersionId } }, completed };
    });
    this.events.publish(transaction.event as WorkflowDomainEvent);
    if (transaction.completed) this.events.publish({ workflowId, type: WorkflowEventType.COMPLETED, payload: { performedById: userId } });
    return transaction.result;
  }

  async reassign(workflowId: number, assignmentId: number, dto: ReassignWorkflowAssignmentDto, userId: string, userRole: string) {
    const [workflow, target] = await Promise.all([
      this.prisma.documentWorkflow.findUnique({ where: { id: workflowId }, include: { assignments: true } }),
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, name: true } }),
    ]);
    if (!workflow || workflow.id !== workflowId) throw new NotFoundException('Workflow no encontrado');
    if (!target) throw new NotFoundException('Usuario de destino no encontrado');
    const assignment = workflow.assignments.find((item) => item.id === assignmentId);
    await this.policy.assertReassignment(userId, workflow, assignment);
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedAssignment = await tx.workflowAssignment.update({
        where: { id: assignmentId },
        data: { userId: target.id, userNameSnapshot: target.name, status: WorkflowAssignmentStatus.PENDING, reassignedAt: new Date(), reassignmentReason: dto.reason },
      });
      await tx.workflowEvent.create({ data: { workflowId, type: WorkflowEventType.REASSIGNED, payload: { assignmentId, previousUserId: assignment.userId, userId: target.id, reason: dto.reason, performedById: userId } } });
      return updatedAssignment;
    });
    this.events.publish({ workflowId, type: WorkflowEventType.REASSIGNED, payload: { assignmentId, userId: target.id, reason: dto.reason, performedById: userId } });
    return result;
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

  private async resolveAssignments(stages: any[]) {
    const result: any[] = [];
    for (const stage of stages) {
      const users = await this.prisma.user.findMany({
        where: { OR: [{ role: stage.roleKey }, { roleAssignments: { some: { role: { key: stage.roleKey, isActive: true } } } }] },
        select: { id: true, name: true, role: true },
      } as any);
      if (!users.length) throw new BadRequestException(`No hay usuarios asignables para el rol ${stage.roleKey}`);
      result.push(...users.map((user: any) => ({ stageDefinitionId: stage.id, userId: user.id, userNameSnapshot: user.name, roleKeySnapshot: stage.roleKey })));
    }
    return result;
  }

  private async getWorkflow(id: number): Promise<any> {
    const workflow = await this.prisma.documentWorkflow.findUnique({ where: { id }, include: { ...WORKFLOW_INCLUDE, document: { select: { uploadedById: true } } } });
    if (!workflow) throw new NotFoundException('Workflow no encontrado');
    return workflow;
  }

  private async createCorrectionVersion(tx: any, workflow: any, userId: string, versionId?: number) {
    const source = await tx.documentVersion.findUnique({ where: { id: versionId ?? workflow.documentVersionId } });
    if (!source) throw new BadRequestException('La versión del documento no existe');
    const nextVersion = await tx.documentVersion.aggregate({ where: { documentId: source.documentId }, _max: { version: true } });
    return tx.documentVersion.create({
      data: {
        documentId: source.documentId,
        version: (nextVersion._max.version ?? 0) + 1,
        filename: source.filename,
        mimetype: source.mimetype,
        storedName: source.storedName,
        path: source.path,
        size: source.size,
        checksumSHA256: source.checksumSHA256,
        comment: 'Nueva versión solicitada por el workflow',
        createdById: userId,
        source: 'CAMBIOS_SOLICITADOS',
        workflowId: workflow.id,
      },
    });
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
