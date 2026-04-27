import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { PilotDocumentStatus } from '@prisma/client';

export class UpdateDocumentFromTemplateDto {
  @ApiProperty({
    description:
      'Datos del formulario actualizados según la definición de la plantilla',
    example: {
      titulo: 'Reunión de planificación Q2 2024',
      fecha: '2024-04-15',
      participantes: 'Juan Pérez, María García',
      contenido: 'Se discutieron los objetivos del segundo trimestre...',
    },
  })
  @IsObject()
  @IsNotEmpty()
  formData: Record<string, any>;

  @ApiProperty({
    description: 'Título del documento',
    example: 'Acta de reunión de secretaría',
    required: false,
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: 'Nuevo nombre del archivo',
    example: 'acta-reunion-2024-04-15.pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  filename?: string;

  @ApiProperty({
    description: 'Nueva descripción del documento',
    example: 'Acta de reunión de planificación Q2',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Fecha propia del documento',
    example: '2026-04-22',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  documentDate?: string;

  @ApiProperty({
    description: 'Remitente del documento',
    example: 'Secretaría General',
    required: false,
  })
  @IsString()
  @IsOptional()
  sender?: string;

  @ApiProperty({
    description: 'Destinatario del documento',
    example: 'Rectorado',
    required: false,
  })
  @IsString()
  @IsOptional()
  recipient?: string;

  @ApiProperty({
    description: 'Palabras clave separadas por comas',
    example: 'acta, secretaría, reunión',
    required: false,
  })
  @IsString()
  @IsOptional()
  keywords?: string;

  @ApiProperty({
    description: 'Estado documental del piloto',
    enum: PilotDocumentStatus,
    example: PilotDocumentStatus.REGISTRADO,
    required: false,
  })
  @IsEnum(PilotDocumentStatus)
  @IsOptional()
  status?: PilotDocumentStatus;

  @ApiProperty({ description: 'Edificio', example: 'Edificio principal', required: false })
  @IsString()
  @IsOptional()
  physicalBuilding?: string;

  @ApiProperty({ description: 'Oficina', example: 'Secretaría', required: false })
  @IsString()
  @IsOptional()
  physicalOffice?: string;

  @ApiProperty({ description: 'Archivo o estante', example: 'Archivo A', required: false })
  @IsString()
  @IsOptional()
  physicalArchive?: string;

  @ApiProperty({ description: 'Gaveta o caja', example: 'Gaveta 2', required: false })
  @IsString()
  @IsOptional()
  physicalBox?: string;

  @ApiProperty({ description: 'Observaciones de ubicación física', example: 'Carpeta azul', required: false })
  @IsString()
  @IsOptional()
  physicalNotes?: string;

  @ApiProperty({
    description: 'Si el documento es público',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiProperty({
    description: 'ID de la categoría del documento',
    example: 2,
    required: false,
  })
  @IsInt()
  @IsOptional()
  categoryId?: number;
}
