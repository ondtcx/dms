import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReportService } from './report.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('dashboard')
  @Roles(
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.VICERRECTOR,
    UserRole.COORDINADOR,
  )
  @ApiOperation({
    summary: 'Obtener dashboard principal con métricas clave',
    description:
      'Retorna un resumen completo con estadísticas y gráficos para el dashboard',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard con métricas y gráficos',
    schema: {
      example: {
        summary: {
          totalDocuments: { total: 1250, active: 1180, deleted: 70 },
          totalUsers: { total: 45, byRole: [{ role: 'profesor', count: 25 }] },
          totalStorage: { total: 5242880000, average: 4442880, max: 52428800 },
        },
        charts: {
          recentUploads: [{ date: '2024-01-01', count: 45 }],
          categoryDistribution: [
            { categoryName: 'Académico', count: 580, color: '#3b82f6' },
          ],
          userActivity: [{ userName: 'Juan Pérez', documentCount: 120 }],
          workflowStats: {
            total: 250,
            byStatus: [{ status: 'APPROVED', count: 200 }],
          },
        },
        executionTime: 245,
      },
    },
  })
  getDashboard() {
    return this.reportService.getDashboard();
  }

  @Get('workflow-bottlenecks')
  @Roles(
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.VICERRECTOR,
    UserRole.COORDINADOR,
  )
  @ApiOperation({
    summary: 'Obtener cuellos de botella en workflows',
    description: 'Identifica workflows pendientes con mayor tiempo de espera',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de workflows con demoras',
    schema: {
      example: [
        {
          workflowId: 1,
          documentId: 123,
          documentName: 'Solicitud_Beca.pdf',
          templateName: 'Solicitud de Beca',
          currentState: 'pending_director',
          daysPending: 15,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    },
  })
  getWorkflowBottlenecks() {
    return this.reportService.getWorkflowBottlenecks();
  }

  @Get('document-compliance')
  @Roles(
    UserRole.ADMIN,
    UserRole.DIRECTOR,
    UserRole.VICERRECTOR,
    UserRole.COORDINADOR,
  )
  @ApiOperation({
    summary: 'Reporte de cumplimiento de documentos',
    description: 'Muestra tasas de cumplimiento de documentos por categoría',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasas de cumplimiento por categoría',
    schema: {
      example: [
        {
          category: 'Documentos Estudiantiles',
          documentCount: 450,
          complianceRate: 92.5,
        },
      ],
    },
  })
  getDocumentCompliance() {
    return this.reportService.getDocumentComplianceReport();
  }
}
