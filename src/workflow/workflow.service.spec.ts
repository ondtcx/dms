import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from './workflow.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('WorkflowService', () => {
  let service: WorkflowService;
  let prisma: PrismaService;

  const mockPrismaService = {
    workflowTemplate: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    document: {
      findFirst: jest.fn(),
    },
    documentWorkflow: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workflowApproval: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    documentVersion: {
      findFirst: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
  };

  const mockNotificationService = {
    notifyApprovalRequested: jest.fn(),
    notifyWorkflowCompleted: jest.fn(),
    notifyChangesRequested: jest.fn(),
    notifyWorkflowAdvanced: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTemplate', () => {
    it('should create a template with initiator roles and state definitions using roleId', async () => {
      mockPrismaService.workflowTemplate.findUnique.mockResolvedValue(null);
      mockPrismaService.workflowTemplate.create.mockResolvedValue({ id: 1 });

      await service.createTemplate({
        name: 'Template',
        states: [
          { state: 'pending', roleId: 'uuid-1', order: 1, requiresComment: false },
        ],
        initiatorRoleIds: ['uuid-2'],
      });

      expect(mockPrismaService.workflowTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Template',
            initiatorRoles: {
              create: [{ roleId: 'uuid-2' }],
            },
            states: {
              create: [{ state: 'pending', roleId: 'uuid-1', order: 1, requiresComment: false }],
            },
          }),
        })
      );
    });
  });

  describe('initiateWorkflow', () => {
    it('should authorize initiation if user roleId is in initiatorRoles relation', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: { id: 'uuid-2', name: 'teacher' },
      });
      mockPrismaService.document.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.documentWorkflow.findUnique.mockResolvedValue(null);
      mockPrismaService.workflowTemplate.findUnique.mockResolvedValue({
        id: 1,
        name: 'Template',
        isActive: true,
        initiatorRoles: [{ roleId: 'uuid-2' }],
        states: [{ state: 'pending', roleId: 'uuid-1', order: 1 }],
      });
      mockPrismaService.role.findUnique.mockResolvedValue({ id: 'uuid-1', name: 'director' });
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'user-2' }]);
      mockPrismaService.documentWorkflow.create.mockResolvedValue({ id: 10 });

      await expect(
        service.initiateWorkflow(1, 'user-1', { templateId: 1 } as any)
      ).resolves.toBeDefined();

      expect(mockPrismaService.documentWorkflow.create).toHaveBeenCalled();
    });

    it('should deny initiation if user roleId is NOT in initiatorRoles relation', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: { id: 'uuid-3', name: 'student' },
      });
      mockPrismaService.document.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.documentWorkflow.findUnique.mockResolvedValue(null);
      mockPrismaService.workflowTemplate.findUnique.mockResolvedValue({
        id: 1,
        name: 'Template',
        isActive: true,
        initiatorRoles: [{ roleId: 'uuid-2' }],
        states: [{ state: 'pending', roleId: 'uuid-1', order: 1 }],
      });

      await expect(
        service.initiateWorkflow(1, 'user-1', { templateId: 1 } as any)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('processApproval', () => {
    it('should transition workflow when approver roleId matches current state roleId', async () => {
      mockPrismaService.documentWorkflow.findUnique.mockResolvedValue({
        id: 10,
        documentId: 1,
        initiatedById: 'initiator-1',
        status: 'IN_PROGRESS',
        currentState: 'pending_director',
        currentStateOrder: 1,
        template: {
          requiresComment: false,
          states: [
            {
              state: 'pending_director',
              roleId: 'role-director',
              order: 1,
              requiresComment: false,
            },
          ],
        },
        document: {
          id: 1,
          versions: [{ filename: 'doc.pdf' }],
          uploadedBy: { departmentId: null },
          academic: null,
        },
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'approver-1',
        name: 'Director User',
        email: 'director@example.com',
        role: { id: 'role-director', name: 'director' },
      });
      mockPrismaService.workflowApproval.findFirst.mockResolvedValue({ id: 100 });
      mockPrismaService.documentVersion.findFirst.mockResolvedValue({ id: 200 });
      mockPrismaService.workflowApproval.update.mockResolvedValue({ id: 100 });
      mockPrismaService.documentWorkflow.update.mockResolvedValue({ id: 10 });

      await expect(
        service.processApproval(10, 'approver-1', {
          action: 'APPROVED',
          comment: 'OK',
        } as any),
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'APPROVED',
        }),
      );
    });

    it('should reject approval when approver roleId does not match current state roleId', async () => {
      mockPrismaService.documentWorkflow.findUnique.mockResolvedValue({
        id: 10,
        documentId: 1,
        initiatedById: 'initiator-1',
        status: 'IN_PROGRESS',
        currentState: 'pending_director',
        currentStateOrder: 1,
        template: {
          requiresComment: false,
          states: [
            {
              state: 'pending_director',
              roleId: 'role-director',
              order: 1,
              requiresComment: false,
            },
          ],
        },
        document: {
          id: 1,
          versions: [{ filename: 'doc.pdf' }],
          uploadedBy: { departmentId: null },
          academic: null,
        },
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'approver-2',
        name: 'Teacher User',
        email: 'teacher@example.com',
        role: { id: 'role-teacher', name: 'teacher' },
      });
      mockPrismaService.workflowApproval.findFirst.mockResolvedValue({ id: 100 });

      await expect(
        service.processApproval(10, 'approver-2', {
          action: 'APPROVED',
          comment: 'OK',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
