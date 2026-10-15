import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // 💡 See this condition
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(
        'Unauthorized access denied (missing token)',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        //secret: jwtConstants.secret,
        secret: this.config.get('JWT_SECRET'),
      });

      const currentUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          authRevision: true,
          role: true,
          email: true,
          name: true,
          lastActivityAt: true,
        },
      });
      if (!currentUser) throw new UnauthorizedException('User no longer exists');
      if (payload.authRevision !== undefined && payload.authRevision !== currentUser.authRevision) {
        throw new UnauthorizedException('Authorization state is outdated');
      }

      const timeoutMinutes = await this.settings.getSessionTimeoutMinutes();
      const now = new Date();
      const expiresAt = new Date(now.getTime() - timeoutMinutes * 60_000);
      if (currentUser.lastActivityAt < expiresAt) {
        throw new UnauthorizedException('Session expired due to inactivity');
      }

      // Use the request start time as the update value so concurrent requests cannot move activity backwards.
      await this.prisma.user.updateMany({
        where: { id: payload.sub, lastActivityAt: { lt: now } },
        data: { lastActivityAt: now },
      });

      request['user'] = {
        ...payload,
        id: payload.sub,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        authRevision: currentUser.authRevision,
      };
    } catch {
      throw new UnauthorizedException(
        'Invalid token provided (unauthorized) sign in again',
      );
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
