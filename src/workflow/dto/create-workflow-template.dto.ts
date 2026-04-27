import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  ValidateNested,
  Length,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStateDefinitionDto {
  @ApiProperty({ description: 'Nombre del estado', example: 'pending_coord' })
  @IsString()
  state: string;

  @ApiProperty({
    description: 'UUID del rol requerido para aprobar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  roleId: string;

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
    description: 'ID de la categoría a la que aplica',
    example: 1,
  })
  @IsInt()
  @IsOptional()
  categoryId?: number;

  @ApiPropertyOptional({
    description: 'IDs de las secciones a las que aplica este workflow',
    example: [1],
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  sectionIds?: number[];

  @ApiProperty({
    description: 'Definiciones de estados del workflow',
    type: [WorkflowStateDefinitionDto],
    example: [
      { state: 'pending_coord', roleId: '123e4567-e89b-12d3-a456-426614174000', order: 1 },
      { state: 'pending_rector', roleId: '123e4567-e89b-12d3-a456-426614174001', order: 2 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStateDefinitionDto)
  states: WorkflowStateDefinitionDto[];

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
    description:
      'IDs de Roles que pueden iniciar esta plantilla. Vacío = sin restricción.',
    example: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001'],
    default: [],
  })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  initiatorRoleIds?: string[];

  @ApiPropertyOptional({
    description: 'Si la plantilla está activa',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
