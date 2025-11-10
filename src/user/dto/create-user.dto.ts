import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsEnum,
} from 'class-validator';
import { UserRole } from '../../auth/role.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nombre completo del usuario',
    example: 'María García',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @ApiProperty({
    description: 'Email único del usuario',
    example: 'nuevo@example.com',
  })
  @IsEmail()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Contraseña del usuario (mínimo 6 caracteres)',
    example: 'Password123!',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    description: 'Rol del usuario en el sistema',
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.USER,
    default: UserRole.USER,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @IsOptional()
  @IsEnum(UserRole, {
    message:
      'role debe ser uno de los siguientes valores: admin, user, moderator',
  })
  role?: UserRole;
}
