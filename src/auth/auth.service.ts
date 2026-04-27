import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { User } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { RoleService } from '../role/role.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly roleService: RoleService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{
    user: Omit<User, 'password'> & { permissions?: string[] };
    access_token: string;
  }> {
    const user = await this.userService.create({
      ...registerDto,
    });

    let permissions: string[] = [];
    if (user.roleId) {
      permissions = await this.roleService.getRolePermissions(user.roleId);
    }

    const payload = {
      email: user.email,
      sub: user.id,
      roleId: user.roleId,
      role: user.role?.name,
      permissions,
    };

    return {
      user: { ...user, permissions },
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async login(loginDto: LoginDto): Promise<{
    user: Omit<User, 'password'> & { permissions?: string[] };
    access_token: string;
  }> {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    let permissions: string[] = [];
    if (user.roleId) {
      permissions = await this.roleService.getRolePermissions(user.roleId);
    }

    const payload = {
      email: user.email,
      sub: user.id,
      roleId: user.roleId,
      role: user.role?.name,
      name: user.name,
      permissions,
    };
    const result = { ...user };
    delete (result as Partial<User>).password;

    return {
      user: { ...result, permissions },
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async getProfile(
    userId: string,
  ): Promise<Omit<User, 'password'> & { permissions?: string[] }> {
    const user = await this.userService.findById(userId);
    let permissions: string[] = [];
    if (user.roleId) {
      permissions = await this.roleService.getRolePermissions(user.roleId);
    }
    return { ...user, permissions };
  }
}
