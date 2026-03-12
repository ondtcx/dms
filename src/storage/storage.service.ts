//src/storage/storage.service.ts
import { Injectable } from '@nestjs/common';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export interface StorageLocation {
  path: string; // Ruta completa del archivo
  directory: string; // Directorio donde se guardó
  filename: string; // Nombre del archivo
}

@Injectable()
export class StorageService {
  private readonly baseUploadPath = './uploads';
  private readonly activePath = join(this.baseUploadPath, 'active');
  private readonly archivePath = join(this.baseUploadPath, 'archive');
  private readonly trashPath = join(this.baseUploadPath, 'trash');
  private readonly tempPath = join(this.baseUploadPath, 'temp');
  private readonly thumbnailPath = join(this.baseUploadPath, 'thumbnails');

  constructor() {
    // Crear directorios base si no existen
    this.ensureDirectoryExists(this.activePath);
    this.ensureDirectoryExists(this.archivePath);
    this.ensureDirectoryExists(this.trashPath);
    this.ensureDirectoryExists(this.tempPath);
    this.ensureDirectoryExists(this.thumbnailPath);
  }

  /**
   * Genera la ruta estructurada para un archivo
   * Estructura: uploads/active/YYYY/MM/DD/users/userId/categories/categoryId/filename
   */
  generateStructuredPath(
    userId: string,
    categoryId: number | null,
    filename: string,
    date: Date = new Date(),
    isArchive: boolean = false,
  ): StorageLocation {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const basePath = isArchive ? this.archivePath : this.activePath;

    // Construir ruta: active/2025/01/15/users/user_abc/categories/cat_1/
    const directory = join(
      basePath,
      String(year),
      month,
      day,
      'users',
      userId,
      'categories',
      categoryId ? `cat_${categoryId}` : 'uncategorized',
    );

    const fullPath = join(directory, filename);

    return {
      path: fullPath,
      directory,
      filename,
    };
  }

  /**
   * Genera la ruta para versiones de un documento
   * Estructura: uploads/active/YYYY/MM/DD/users/userId/versions/filename
   */
  generateVersionPath(
    userId: string,
    filename: string,
    date: Date = new Date(),
  ): StorageLocation {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const directory = join(
      this.activePath,
      String(year),
      month,
      day,
      'users',
      userId,
      'versions',
    );

    const fullPath = join(directory, filename);

    return {
      path: fullPath,
      directory,
      filename,
    };
  }

  /**
   * Asegura que un directorio existe, si no lo crea recursivamente
   */
  ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Mueve un archivo de origen a destino
   */
  moveFile(sourcePath: string, destinationPath: string): void {
    // Asegurar que el directorio destino existe
    const destinationDir = dirname(destinationPath);
    this.ensureDirectoryExists(destinationDir);

    // Copiar archivo
    copyFileSync(sourcePath, destinationPath);

    // Eliminar archivo original
    unlinkSync(sourcePath);
  }

  /**
   * Copia un archivo (usado para versionado)
   */
  copyFile(sourcePath: string, destinationPath: string): void {
    const destinationDir = dirname(destinationPath);
    this.ensureDirectoryExists(destinationDir);

    copyFileSync(sourcePath, destinationPath);
  }

  /**
   * Mueve un archivo a la papelera (soft delete)
   */
  moveToTrash(
    sourcePath: string,
    documentId: number,
    originalFilename: string,
  ): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const trashFilename = `${timestamp}_doc${documentId}_${originalFilename}`;
    const trashFullPath = join(this.trashPath, trashFilename);

    this.moveFile(sourcePath, trashFullPath);

    return trashFullPath;
  }

  /**
   * Restaura un archivo desde la papelera
   */
  restoreFromTrash(trashPath: string, destinationPath: string): void {
    this.moveFile(trashPath, destinationPath);
  }

  /**
   * Elimina un archivo permanentemente
   */
  deleteFile(filePath: string): void {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  /**
   * Calcula el hash SHA256 de un archivo
   */
  async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (error) => reject(error));
    });
  }

  /**
   * Verifica la integridad de un archivo comparando hashes
   */
  async verifyFileIntegrity(
    filePath: string,
    expectedHash: string,
  ): Promise<boolean> {
    const actualHash = await this.calculateFileHash(filePath);
    return actualHash === expectedHash;
  }

  /**
   * Obtiene información del sistema de archivos
   */
  fileExists(filePath: string): boolean {
    return existsSync(filePath);
  }

  /**
   * Obtiene las rutas base del sistema
   */
  getPaths() {
    return {
      base: this.baseUploadPath,
      active: this.activePath,
      archive: this.archivePath,
      trash: this.trashPath,
      temp: this.tempPath,
      thumbnails: this.thumbnailPath,
    };
  }
}
