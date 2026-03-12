import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global() // Hace que el servicio esté disponible en toda la aplicación
@Module({
  providers: [StorageService],
  exports: [StorageService, StorageModule],
})
export class StorageModule {}
