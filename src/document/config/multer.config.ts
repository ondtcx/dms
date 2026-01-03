// src/documents/config/multer.config.ts
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
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
      const uniqueName = `${Date.now()}_${uuidv4()}${extname(file.originalname)}`;
      callback(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB máximo
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
