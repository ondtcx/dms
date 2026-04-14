// src/documents/config/multer.config.ts
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';

// Asegurar que el directorio temp existe
const tempDir = './uploads/temp';
if (!existsSync(tempDir)) {
  mkdirSync(tempDir, { recursive: true });
}

export const multerConfig = {
  storage: diskStorage({
    destination: tempDir, // Guardar temporalmente en /uploads/temp
    filename: (req, file, callback) => {
      // Generar nombre único temporal
      const uniqueName = `${Date.now()}_${randomUUID()}${extname(file.originalname)}`;
      callback(null, uniqueName);
    },
  }),
  // Sin límite de red — la validación dinámica se hace en el controller
  // usando SettingsService.getMaxFileSizeMb()
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB techo de red absoluto
  },
};

// Tipos de archivos permitidos
//TODO: ajustar según necesidades
export const imageFileFilter = (req, file, callback) => {
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return callback(new Error('Solo se permiten imágenes'), false);
  }
  callback(null, true);
};

export const documentFileFilter = (req, file, callback) => {
  if (
    !file.originalname.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i)
  ) {
    return callback(new Error('Tipo de archivo no permitido'), false);
  }
  callback(null, true);
};

// Filtro que acepta todos los archivos (con límites)
export const allFilesFilter = (req, file, callback) => {
  // Lista negra de extensiones peligrosas
  const dangerousExtensions = /\.(exe|bat|sh|cmd|com|app|jar|js|php|py|rb)$/i;

  if (file.originalname.match(dangerousExtensions)) {
    return callback(
      new Error('Tipo de archivo no permitido por seguridad'),
      false,
    );
  }

  callback(null, true);
};
