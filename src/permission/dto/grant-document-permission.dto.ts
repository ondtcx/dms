import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../auth/role.enum';

export class GrantDocumentPermissionDto {
  @ApiPropertyOptional({
    description:
      'ID del usuario específico (al menos uno de userId o role debe estar presente)',
    example: 'cuid123',
  })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Rol al que se otorga el permiso',
    enum: UserRole,
    example: UserRole.PROFESOR,
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Clave del rol catalogado', example: 'editor' })
  @IsString()
  @IsOptional()
  roleKey?: string;

  @ApiPropertyOptional({
    description: 'Permiso de visualización',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  canView?: boolean;

  @ApiPropertyOptional({
    description: 'Permiso de edición',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  canEdit?: boolean;

  @ApiPropertyOptional({
    description: 'Permiso de eliminación',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  canDelete?: boolean;

  @ApiPropertyOptional({
    description: 'Permiso de compartir',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  canShare?: boolean;

  @ApiPropertyOptional({
    description: 'Fecha de expiración del permiso',
    example: '2025-12-31T23:59:59Z',
  })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
