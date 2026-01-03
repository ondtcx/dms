import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { DocumentModule } from './document/document.module';
import { DocumentTemplateModule } from './document-template/document-template.module';
import { CategoryModule } from './category/category.module';
import { StorageModule } from './storage/storage.module';
import { TasksModule } from './tasks/tasks.module';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Servir archivos estáticos (opcional, para ver uploads)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/files',
    }),
    StorageModule, // Módulo global de almacenamiento
    TasksModule, // Tareas programadas (cronjobs)
    UserModule,
    AuthModule,
    CategoryModule,
    DocumentModule,
    DocumentTemplateModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
