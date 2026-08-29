import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { DocumentModule } from './document/document.module';
import { DocumentTemplateModule } from './document-template/document-template.module';
import { CategoryModule } from './category/category.module';
import { PermissionModule } from './permission/permission.module';
import { SearchModule } from './search/search.module';
import { BatchModule } from './batch/batch.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { OnlyofficeModule } from './onlyoffice/onlyoffice.module';
import { SettingsModule } from './settings/settings.module';
import { AcademicYearModule } from './academic-year/academic-year.module';
import { DocumentTypeModule } from './document-type/document-type.module';
import { DocumentCompositionModule } from './document-composition/document-composition.module';
import { join } from 'path';
import catalogAuthorizationConfig from './config/catalog-authorization.config';
import { RoleModule } from './role/role.module';
import { DirectoryModule } from './directory/directory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [catalogAuthorizationConfig] }),
    // Servir archivos estáticos — process.cwd() siempre apunta al directorio
    // raíz del proyecto (dms-backend/) sin importar si corre desde src/ o dist/
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/files',
    }),
    StorageModule, // Módulo global de almacenamiento
    TasksModule, // Tareas programadas (cronjobs)
    PermissionModule, // Sistema de permisos (global)
    UserModule,
    AuthModule,
    CategoryModule,
    SearchModule, // Sistema de búsqueda full-text
    BatchModule, // Operaciones en lote
    AcademicYearModule, // Gestión de años lectivos
    DocumentTypeModule, // Subtipos de documento por categoría
    DocumentModule,
    DocumentTemplateModule,
    DocumentCompositionModule,
    OnlyofficeModule, // Integración con OnlyOffice
    SettingsModule, // Configuración del sistema
    RoleModule,
    DirectoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
