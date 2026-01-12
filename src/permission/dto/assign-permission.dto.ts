import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsObject } from 'class-validator';
import { UserRole } from '../../auth/role.enum';

export class AssignPermissionDto {
  @ApiProperty({
    description: 'Rol al que se asignará el permiso',
    enum: UserRole,
    example: UserRole.PROFESOR,
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({
    description: 'ID del permiso a asignar',
    example: 1,
  })
  @IsInt()
  permissionId: number;

  @ApiPropertyOptional({
    description: 'Condiciones opcionales para el permiso',
    example: { departmentId: '$user.departmentId' },
  })
  @IsObject()
  @IsOptional()
  conditions?: Record<string, any>;
}
