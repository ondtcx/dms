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
import { AuthorizationProfile, AuthorizationService } from './compatibility/authorization.service';
import { SettingsService } from '../settings/settings.service';

export type AuthenticatedProfile = Omit<AuthorizationProfile, 'user'> & { user: any };

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20); let bits = 0; let value = 0; let result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += BASE32[(value << (5 - bits)) & 31]; return result;
}
export function verifyTotp(secret: string, code: string, timestamp = Date.now()): boolean {
  const normalized = code.replace(/\s/g, ''); if (!/^\d{6}$/.test(normalized)) return false;
  let bits = 0; let value = 0; const key: number[] = [];
  for (const char of secret.toUpperCase()) { const index = BASE32.indexOf(char); if (index < 0) return false; value = (value << 5) | index; bits += 5; if (bits >= 8) { key.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const counter = Math.floor(timestamp / 30000);
  for (let offset = -1; offset <= 1; offset++) { const data = Buffer.alloc(8); data.writeBigInt64BE(BigInt(counter + offset)); const digest = crypto.createHmac('sha1', Buffer.from(key)).update(data).digest(); const position = digest[digest.length - 1] & 15; const otp = (((digest[position] & 127) << 24) | (digest[position + 1] << 16) | (digest[position + 2] << 8) | digest[position + 3]) % 1000000; if (otp === Number(normalized)) return true; }
  return false;
}
const recoveryCodes = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly settings: SettingsService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ): Promise<{ user: any; access_token: string }> {
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

  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx: any) => {
          const current = await tx.user.findUnique({ where: { id: userId }, select: { totpRecoveryCodeHashes: true } });
          const hashes = recoveryCodes(current?.totpRecoveryCodeHashes);
          for (let index = 0; index < hashes.length; index++) {
            if (await bcrypt.compare(code, hashes[index])) {
              hashes.splice(index, 1);
              await tx.user.update({ where: { id: userId }, data: { totpRecoveryCodeHashes: hashes } });
              return true;
            }
          }
          return false;
        }, { isolationLevel: 'Serializable' } as any);
      } catch (error: any) {
        if (error?.code !== 'P2034' || attempt === 2) throw new UnauthorizedException('No se pudo verificar el código de recuperación; inténtelo nuevamente');
      }
    }
    return false;
  }

  async login(loginDto: LoginDto): Promise<any> {
    let user: any;
    try {
      user = await this.userService.findByEmail(loginDto.email);
    } catch (error) {
      // El flujo de login no debe revelar si el correo existe.
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      throw error;
    }

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.updateMany({
        where: { id: user.id, lockedUntil: { lte: now } },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
      user.lockedUntil = null;
      user.failedLoginAttempts = 0;
    }

    const passwordMatches = await bcrypt.compare(loginDto.password, user.password);
    if (!passwordMatches) {
      const maxAttempts = await this.settings.getMaxLoginAttempts();
      const failed = await this.prisma.user.updateMany({
        where: {
          id: user.id,
          lockedUntil: null,
          failedLoginAttempts: { lt: maxAttempts },
        },
        data: { failedLoginAttempts: { increment: 1 } },
      });

      if (failed.count > 0) {
        await this.prisma.user.updateMany({
          where: {
            id: user.id,
            lockedUntil: null,
            failedLoginAttempts: { gte: maxAttempts },
          },
          data: { lockedUntil: new Date(now.getTime() + 15 * 60_000) },
        });
      }
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastActivityAt: now },
    });

    if (user.totpEnabled) {
      if (!loginDto.code) {
        throw new UnauthorizedException({ code: 'TWO_FACTOR_REQUIRED', message: 'Se requiere un código de autenticación de dos factores' });
      }
      let valid = Boolean(user.totpSecret && verifyTotp(user.totpSecret, loginDto.code));
      if (!valid) valid = await this.consumeRecoveryCode(user.id, loginDto.code);
      if (!valid) throw new UnauthorizedException({ code: 'TWO_FACTOR_REQUIRED', message: 'Se requiere un código de autenticación de dos factores' });
    }

    const authorization = await this.authorization.getAuthorization(user.id);
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      name: user.name,
      authRevision: authorization.authRevision,
    };
    const { password, lastActivityAt, failedLoginAttempts, lockedUntil, totpSecret, totpPendingSecret, totpEnabled, totpRecoveryCodeHashes, ...result } = user;

    return {
      user: result,
      access_token: await this.jwtService.signAsync(payload),
      roles: authorization.roles,
      permissions: authorization.permissions,
      authRevision: authorization.authRevision,
    };
  }

  async getTotpStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpEnabled: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return { enabled: user.totpEnabled };
  }

  async setupTotp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabled: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.totpEnabled) throw new BadRequestException('2FA ya está habilitado');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpPendingSecret: secret } });
    return { secret, otpauthUri: `otpauth://totp/DMS:${encodeURIComponent(user.email)}?secret=${secret}&issuer=DMS` };
  }

  async enableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpPendingSecret: true } });
    if (!user?.totpPendingSecret || !verifyTotp(user.totpPendingSecret, code)) throw new BadRequestException('Código inválido');
    const plainCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
    const hashes = await Promise.all(plainCodes.map((item) => bcrypt.hash(item, 10)));
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: user.totpPendingSecret, totpPendingSecret: null, totpEnabled: true, totpRecoveryCodeHashes: hashes } });
    return { enabled: true, recoveryCodes: plainCodes };
  }

  async disableTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabled: true, totpRecoveryCodeHashes: true } });
    if (!user?.totpEnabled || !user.totpSecret) throw new BadRequestException('2FA no está habilitado');
    let valid = verifyTotp(user.totpSecret, code);
    if (!valid) valid = await this.consumeRecoveryCode(userId, code);
    if (!valid) throw new BadRequestException('Código inválido');
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: null, totpPendingSecret: null, totpEnabled: false, totpRecoveryCodeHashes: [] } });
    return { enabled: false };
  }

  async getProfile(userId: string): Promise<AuthenticatedProfile> {
    const [profileUser, authorization] = await Promise.all([
      this.userService.findById(userId),
      this.authorization.getAuthorization(userId),
    ]);

    return {
      user: profileUser,
      roles: authorization.roles,
      permissions: authorization.permissions,
      authRevision: authorization.authRevision,
    };
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
        data: { password: hashedPassword, authRevision: { increment: 1 } },
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
      data: { password: hashedPassword, authRevision: { increment: 1 } },
    });

    return { message: 'Contraseña cambiada exitosamente' };
  }
}
