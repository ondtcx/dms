import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { UserRole } from '../../auth/role.enum';

export class BatchShareDto {
  @ApiProperty({ description: 'IDs de los documentos a compartir', type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  documentIds: number[];

  @ApiPropertyOptional({ description: 'ID del usuario específico (opcional)' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Rol específico (opcional)',
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'ID del departamento (opcional)' })
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'ID del curso (opcional)' })
  @IsOptional()
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({ description: 'Permitir ver', default: true })
  @IsOptional()
  @IsBoolean()
  canView?: boolean;

  @ApiPropertyOptional({ description: 'Permitir descargar', default: true })
  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;

  @ApiPropertyOptional({ description: 'Permitir editar', default: false })
  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @ApiPropertyOptional({ description: 'Permitir re-compartir', default: false })
  @IsOptional()
  @IsBoolean()
  canShare?: boolean;

  @ApiPropertyOptional({ description: 'Crear link público', default: false })
  @IsOptional()
  @IsBoolean()
  isPublicLink?: boolean;

  @ApiPropertyOptional({ description: 'Fecha de expiración (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Máximo número de vistas permitidas' })
  @IsOptional()
  @IsInt()
  maxViews?: number;
}
