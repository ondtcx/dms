// src/documents/pipes/file-validation.pipe.ts
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  constructor(private readonly maxSize: number) {}

  transform(value: any) {
    if (!value) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    // maxSize en MB
    const maxSizeBytes = this.maxSize * 1024 * 1024;

    if (value.size > maxSizeBytes) {
      throw new BadRequestException(
        `El archivo es demasiado grande. Máximo ${this.maxSize}MB`,
      );
    }

    return value;
  }
}

@Injectable()
export class FileTypeValidationPipe implements PipeTransform {
  constructor(private readonly allowedTypes: string[]) {}

  transform(value: any) {
    if (!value) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    const fileExtension = value.originalname.split('.').pop().toLowerCase();

    if (!this.allowedTypes.includes(fileExtension)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido. Permitidos: ${this.allowedTypes.join(', ')}`,
      );
    }

    return value;
  }
}
