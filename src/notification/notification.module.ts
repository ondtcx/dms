import { Module, Global } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { PrismaService } from '../prisma/prisma.service';

@Global() // Hacer el módulo global para que esté disponible en toda la aplicación
@Module({
  controllers: [NotificationController],
  providers: [NotificationService, PrismaService],
  exports: [NotificationService], // Exportar el servicio para uso en otros módulos
})
export class NotificationModule {}
