import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { DocumentModule } from './document/document.module';
import { DocumentTemplateModule } from './document-template/document-template.module';
import { CategoryModule } from './category/category.module';
import { SectionModule } from './section/section.module';
import { DepartmentModule } from './department/department.module';
import { CourseModule } from './course/course.module';
import { SubjectModule } from './subject/subject.module';
import { PermissionModule } from './permission/permission.module';
import { WorkflowModule } from './workflow/workflow.module';
import { NotificationModule } from './notification/notification.module';
import { CommentModule } from './comment/comment.module';
import { SearchModule } from './search/search.module';
import { ReportModule } from './report/report.module';
import { ShareModule } from './share/share.module';
import { TransferModule } from './transfer/transfer.module';
import { BatchModule } from './batch/batch.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { OnlyofficeModule } from './onlyoffice/onlyoffice.module';
import { SettingsModule } from './settings/settings.module';
import { AcademicYearModule } from './academic-year/academic-year.module';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Servir archivos estáticos — process.cwd() siempre apunta al directorio
    // raíz del proyecto (dms-backend/) sin importar si corre desde src/ o dist/
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/files',
    }),
    StorageModule, // Módulo global de almacenamiento
    TasksModule, // Tareas programadas (cronjobs)
    PermissionModule, // Sistema de permisos (global)
    NotificationModule, // Sistema de notificaciones (global)
    UserModule,
    AuthModule,
    CategoryModule,
    SectionModule,
    DepartmentModule, // Gestión de departamentos
    CourseModule, // Gestión de cursos
    SubjectModule, // Gestión de materias
    WorkflowModule, // Sistema de workflows y aprobaciones
    CommentModule, // Sistema de comentarios y anotaciones
    SearchModule, // Sistema de búsqueda full-text
    ReportModule, // Sistema de reportes y analítica
    ShareModule, // Sistema de compartir documentos
    TransferModule, // Sistema de transferencias de documentos
    BatchModule, // Operaciones en lote
    AcademicYearModule, // Gestión de años lectivos
    DocumentModule,
    DocumentTemplateModule,
    OnlyofficeModule, // Integración con OnlyOffice
    SettingsModule, // Configuración del sistema
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
