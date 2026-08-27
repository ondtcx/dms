import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserRole } from './role.enum';
import { AuthorizationService } from './compatibility/authorization.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ): Promise<{ user: Omit<User, 'password'>; access_token: string }> {
    const user = await this.userService.create({
      ...registerDto,
      role: UserRole.USER, // Siempre USER
    });

    const payload = { email: user.email, sub: user.id, role: user.role, authRevision: user.authRevision };

    return {
      user,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async login(loginDto: LoginDto): Promise<{
    user: Omit<User, 'password'>;
    access_token: string;
    roles: string[];
    permissions: string[];
    authRevision: number;
  }> {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const authorization = await this.authorization.getAuthorization(user.id);
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      name: user.name,
      authRevision: user.authRevision,
    };
    const { password, ...result } = user;

    return {
      user: result,
      access_token: await this.jwtService.signAsync(payload),
      roles: authorization.roles,
      permissions: authorization.permissions,
      authRevision: user.authRevision,
    };
  }

  async getProfile(userId: string): Promise<Omit<User, 'password'>> {
    return this.userService.findById(userId);
  }

  async generateResetToken(userId: string): Promise<{ token: string; expiresAt: string }> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Invalidate any existing unused tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(0) }, // Expire them immediately
    });

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.passwordResetToken.create({
      data: { token, userId, expiresAt },
    });

    return { token, expiresAt: expiresAt.toISOString() };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Find valid, unused token
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken || resetToken.usedAt) {
      throw new BadRequestException('Token inválido o ya utilizado');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('El token ha expirado');
    }

    // Hash new password and update user in a transaction
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
    ]);

    return { message: 'Contraseña restablecida exitosamente' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // Fetch user with password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Contraseña cambiada exitosamente' };
  }
}
