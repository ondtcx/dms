import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from './role.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ): Promise<{ user: Omit<User, 'password'>; access_token: string }> {
    const user = await this.userService.create({
      ...registerDto,
      role: UserRole.USER, // Siempre USER
    });

    const payload = { email: user.email, sub: user.id, role: user.role };

    return {
      user,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async login(loginDto: LoginDto): Promise<{
    user: Omit<User, 'password'>;
    access_token: string;
  }> {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      name: user.name,
    };
    const { password, ...result } = user;

    return {
      user: result,
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async getProfile(userId: string): Promise<Omit<User, 'password'>> {
    return this.userService.findById(userId);
  }
}
