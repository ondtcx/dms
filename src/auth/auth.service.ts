import { BadRequestException, Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async signIn(email: string, pass: string): Promise<{ access_token: string }> {
    const user = await this.userService.findByEmail(email);
    const roles = await this.prisma.user.findUnique({
      where: { email: email },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    console.log('roles', roles);

    //todo: bcrypt password check
    if (user?.password !== pass) {
      throw new BadRequestException('Invalid credentials');
    }

    //TODO: add roles to the payload
    const payload = { sub: user.id, email: user.email };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async createRole(name: string): Promise<Role> {
    return this.prisma.role.create({ data: { name: name } });
  }

  // obtain roles
  async findAllRoles(): Promise<Role[]> {
    return this.prisma.role.findMany();
  }
}
