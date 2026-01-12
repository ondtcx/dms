import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowStatus } from '@prisma/client';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  // ============ Dashboard Principal ============

  async getDashboard() {
    const startTime = Date.now();

    const [
      totalDocuments,
      totalUsers,
      totalStorage,
      recentUploads,
      categoryDistribution,
      userActivity,
      workflowStats,
    ] = await Promise.all([
      this.getTotalDocuments(),
      this.getTotalUsers(),
      this.getTotalStorage(),
      this.getRecentUploads(),
      this.getCategoryDistribution(),
      this.getUserActivity(),
      this.getWorkflowStats(),
    ]);

    return {
      summary: {
        totalDocuments,
        totalUsers,
        totalStorage,
      },
      charts: {
        recentUploads,
        categoryDistribution,
        userActivity,
        workflowStats,
      },
      executionTime: Date.now() - startTime,
    };
  }

  // ============ Reportes Individuales ============

  /**
   * 1. Total de documentos
   */
  private async getTotalDocuments() {
    const [total, active, deleted] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.document.count({ where: { deletedAt: { not: null } } }),
    ]);

    return { total, active, deleted };
  }

  /**
   * 2. Total de usuarios
   */
  private async getTotalUsers() {
    const usersByRole = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { role: true },
    });

    return {
      total: usersByRole.reduce((sum, item) => sum + item._count.role, 0),
      byRole: usersByRole.map((item) => ({
        role: item.role,
        count: item._count.role,
      })),
    };
  }

  /**
   * 3. Uso de almacenamiento total y por departamento
   */
  private async getTotalStorage() {
    const result = await this.prisma.document.aggregate({
      where: { deletedAt: null },
      _sum: { size: true },
      _avg: { size: true },
      _max: { size: true },
    });

    // Por departamento
    const byDepartment = await this.prisma.$queryRaw<any[]>`
      SELECT
        d."name" as department,
        COUNT(doc.id) as "documentCount",
        COALESCE(SUM(doc.size), 0) as "totalSize"
      FROM "Department" d
      LEFT JOIN "User" u ON u."departmentId" = d.id
      LEFT JOIN "Document" doc ON doc."uploadedById" = u.id AND doc."deletedAt" IS NULL
      GROUP BY d.id, d."name"
      ORDER BY "totalSize" DESC
    `;

    return {
      total: result._sum.size || 0,
      average: result._avg.size || 0,
      max: result._max.size || 0,
      byDepartment: byDepartment.map((item) => ({
        department: item.department,
        documentCount: Number(item.documentCount),
        totalSize: Number(item.totalSize),
      })),
    };
  }

  /**
   * 4. Tendencias de uploads (últimos 30 días)
   */
  private async getRecentUploads() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const uploads = await this.prisma.$queryRaw<any[]>`
      SELECT
        DATE(\"createdAt\") as date,
        COUNT(*) as count
      FROM \"Document\"
      WHERE \"createdAt\" >= ${thirtyDaysAgo}
        AND \"deletedAt\" IS NULL
      GROUP BY DATE(\"createdAt\")
      ORDER BY date ASC
    `;

    return uploads.map((item) => ({
      date: item.date,
      count: Number(item.count),
    }));
  }

  /**
   * 5. Distribución por categorías
   */
  private async getCategoryDistribution() {
    const distribution = await this.prisma.document.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null },
      _count: { categoryId: true },
    });

    // Obtener nombres de categorías
    const categories = await this.prisma.category.findMany({
      where: {
        id: { in: distribution.map((d) => d.categoryId).filter((id) => id !== null) },
      },
      select: { id: true, name: true, color: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return distribution.map((item) => {
      const category = item.categoryId ? categoryMap.get(item.categoryId) : null;
      return {
        categoryId: item.categoryId,
        categoryName: category?.name || 'Sin categoría',
        color: category?.color || '#9ca3af',
        count: item._count.categoryId,
      };
    });
  }

  /**
   * 6. Usuarios más activos
   */
  private async getUserActivity() {
    const activeUsers = await this.prisma.document.groupBy({
      by: ['uploadedById'],
      where: { deletedAt: null },
      _count: { uploadedById: true },
      orderBy: { _count: { uploadedById: 'desc' } },
      take: 10,
    });

    // Obtener información de usuarios
    const userIds = activeUsers.map((u) => u.uploadedById);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, role: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return activeUsers.map((item) => {
      const user = userMap.get(item.uploadedById);
      return {
        userId: item.uploadedById,
        userName: user?.name || user?.email || 'Usuario desconocido',
        role: user?.role,
        documentCount: item._count.uploadedById,
      };
    });
  }

  /**
   * 7. Estadísticas de workflows
   */
  private async getWorkflowStats() {
    const [total, byStatus, avgCompletionTime] = await Promise.all([
      this.prisma.documentWorkflow.count(),
      this.prisma.documentWorkflow.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.getAvgWorkflowCompletionTime(),
    ]);

    return {
      total,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      avgCompletionTime,
    };
  }

  private async getAvgWorkflowCompletionTime() {
    const completed = await this.prisma.documentWorkflow.findMany({
      where: {
        status: 'APPROVED',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    if (completed.length === 0) return 0;

    const totalTime = completed.reduce((sum, wf) => {
      const diff = wf.completedAt!.getTime() - wf.createdAt.getTime();
      return sum + diff;
    }, 0);

    // Retornar en horas
    return Math.round(totalTime / completed.length / (1000 * 60 * 60));
  }

  // ============ Reportes Específicos ============

  /**
   * Reporte de cuellos de botella en aprobaciones
   */
  async getWorkflowBottlenecks() {
    const pendingWorkflows = await this.prisma.documentWorkflow.findMany({
      where: {
        status: WorkflowStatus.PENDING,
      },
      include: {
        document: {
          select: { id: true, filename: true },
        },
        template: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return pendingWorkflows.map((wf: any) => ({
      workflowId: wf.id,
      documentId: wf.documentId,
      documentName: wf.document?.filename || 'Unknown',
      templateName: wf.template?.name || 'Unknown',
      currentState: wf.currentState,
      daysPending: Math.floor((Date.now() - wf.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      createdAt: wf.createdAt,
    }));
  }

  /**
   * Reporte de cumplimiento de documentos estudiantiles
   */
  async getDocumentComplianceReport() {
    // Este es un placeholder - en producción se implementaría con datos de estudiantes
    const documentsByCategory = await this.prisma.document.groupBy({
      by: ['categoryId'],
      where: { deletedAt: null },
      _count: { categoryId: true },
    });

    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return documentsByCategory.map((item) => ({
      category: item.categoryId ? categoryMap.get(item.categoryId) : 'Sin categoría',
      documentCount: item._count.categoryId,
      complianceRate: 100, // Placeholder
    }));
  }
}
