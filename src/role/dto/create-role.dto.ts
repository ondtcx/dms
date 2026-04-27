import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Nombre único del rol',
    example: 'category_admin',
  })
  @IsString()
  @MinLength(3)
  name: string;

  @ApiPropertyOptional({
    description: 'Descripción del rol',
    example: 'Puede administrar categorías',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Acciones de permisos que debe heredar el rol',
    example: ['role:admin', 'roles:read'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  permissionActions: string[];
}
