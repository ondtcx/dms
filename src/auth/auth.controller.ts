import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  //UseGuards,
} from '@nestjs/common';
//import { AuthGuard } from './auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GenerateResetTokenDto } from './dto/generate-reset-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserRole } from './role.enum';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description: 'Autentica un usuario y devuelve un token JWT',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso',
    schema: {
      example: {
        user: {
          id: 1,
          email: 'admin@example.com',
          name: 'Administrador',
          role: 'admin',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('2fa/status')
  @ApiBearerAuth('JWT-auth')
  getTotpStatus(@CurrentUser() user: any) { return this.authService.getTotpStatus(user.id); }

  @Post('2fa/setup')
  @ApiBearerAuth('JWT-auth')
  setupTotp(@CurrentUser() user: any) { return this.authService.setupTotp(user.id); }

  @Post('2fa/enable')
  @ApiBearerAuth('JWT-auth')
  enableTotp(@CurrentUser() user: any, @Body('code') code: string) { return this.authService.enableTotp(user.id, code); }

  @Post('2fa/disable')
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 400, description: 'Código inválido o 2FA no está habilitado' })
  disableTotp(@CurrentUser() user: any, @Body('code') code: string) { return this.authService.disableTotp(user.id, code); }

  @Post('register')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Registrar nuevo usuario',
    description:
      'Crea una cuenta de usuario. Solo accesible por administradores.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario registrado exitosamente',
    schema: {
      example: {
        user: {
          id: 1,
          email: 'usuario@example.com',
          name: 'Juan Pérez',
          role: 'user',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'El email ya está registrado',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  //@UseGuards(AuthGuard)
  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener perfil del usuario autenticado',
    description: 'Devuelve la información del usuario que está autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Perfil obtenido exitosamente',
    schema: {
      example: {
        user: {
          id: 1,
          email: 'admin@example.com',
          name: 'Administrador',
          role: 'admin',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
        roles: ['admin'],
        permissions: ['roles.manage'],
        authRevision: 4,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado - Token inválido o ausente',
  })
  getProfile(@CurrentUser() user: any) {
    return this.authService.getProfile(user.id);
  }

  @Post('admin/generate-reset-token')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Generar token de restablecimiento de contraseña',
    description:
      'Permite a un administrador generar un token de restablecimiento de contraseña para un usuario. El token expira en 24 horas y es de un solo uso.',
  })
  @ApiBody({ type: GenerateResetTokenDto })
  @ApiResponse({
    status: 201,
    description: 'Token generado exitosamente',
    schema: {
      example: {
        token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        expiresAt: '2026-06-18T23:39:59.000Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  @ApiResponse({
    status: 403,
    description: 'No autorizado - Se requiere rol de administrador',
  })
  @ApiResponse({
    status: 404,
    description: 'Usuario no encontrado',
  })
  async generateResetToken(@Body() dto: GenerateResetTokenDto) {
    return this.authService.generateResetToken(dto.userId);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña con token',
    description:
      'Permite restablecer la contraseña utilizando un token de restablecimiento válido y no expirado.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Contraseña restablecida exitosamente',
    schema: {
      example: {
        message: 'Contraseña restablecida exitosamente',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Token inválido, expirado o ya utilizado',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Cambiar contraseña',
    description:
      'Permite al usuario autenticado cambiar su contraseña proporcionando la contraseña actual y una nueva.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Contraseña cambiada exitosamente',
    schema: {
      example: {
        message: 'Contraseña cambiada exitosamente',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'La contraseña actual es incorrecta o la nueva contraseña no cumple los requisitos',
  })
  @ApiResponse({
    status: 401,
    description: 'No autenticado',
  })
  async changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
