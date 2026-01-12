import { Module, Global } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionController } from './permission.controller';
import { PrismaService } from '../prisma/prisma.service';

@Global() // Hacer el módulo global para que esté disponible en toda la aplicación
@Module({
  controllers: [PermissionController],
  providers: [PermissionService, PrismaService],
  exports: [PermissionService], // Exportar el servicio para uso en guards y otros módulos
})
export class PermissionModule {}
