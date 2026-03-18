import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

class StateDefinition {
  @ApiProperty({ description: 'Nombre del estado', example: 'pending_coord' })
  @IsString()
  state: string;

  @ApiProperty({ description: 'Rol requerido para aprobar', example: 'coordinador' })
  @IsString()
  role: string;

  @ApiProperty({ description: 'Orden del estado en el workflow', example: 1 })
  @IsInt()
  order: number;

  @ApiPropertyOptional({ description: 'Si requiere comentario obligatorio' })
  @IsBoolean()
  @IsOptional()
  requiresComment?: boolean;
}

export class CreateWorkflowTemplateDto {
  @ApiProperty({
    description: 'Nombre de la plantilla de workflow',
    example: 'Aprobación de Documentos Administrativos',
  })
  @IsString()
  @Length(3, 100)
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del workflow',
    example: 'Workflow para aprobar documentos del departamento administrativo',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Tipo de documento al que aplica',
    example: 'acta',
  })
  @IsString()
  @IsOptional()
  documentType?: string;

  @ApiPropertyOptional({
    description: 'ID de la categoría a la que aplica',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiProperty({
    description: 'Definiciones de estados del workflow',
    type: [StateDefinition],
    example: [
      { state: 'pending_coord', role: 'coordinador', order: 1 },
      { state: 'pending_director', role: 'director', order: 2 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StateDefinition)
  stateDefinitions: StateDefinition[];

  @ApiPropertyOptional({
    description: 'Auto-asignar aprobadores según rol',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  autoAssign?: boolean;

  @ApiPropertyOptional({
    description: 'Requiere comentario al aprobar/rechazar',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  requiresComment?: boolean;

  @ApiPropertyOptional({
    description: 'Roles que pueden iniciar esta plantilla. Vacío = sin restricción. ADMIN bypasea siempre.',
    example: ['profesor', 'coordinador'],
    default: [],
  })
  @IsArray()
  @IsOptional()
  allowedInitiatorRoles?: string[];

  @ApiPropertyOptional({
    description: 'Si la plantilla está activa',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
