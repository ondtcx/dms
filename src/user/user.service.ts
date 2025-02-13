import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(user: Prisma.UserCreateInput): Promise<User> {
    const userExists = await this.prisma.user.findUnique({
      where: { email: user.email },
    });

    if (userExists) {
      throw new BadRequestException('User already exists');
    }

    return this.prisma.user.create({ data: user });
  }

  async findAllUsers(): Promise<User[]> {
    return this.prisma.user.findMany();
  }

  async findById(id: string) {
    const userFound = await this.prisma.user.findUnique({
      where: { id: id },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return userFound;
  }

  async findByEmail(email: string) {
    const userFound = await this.prisma.user.findUnique({
      where: { email: email },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return userFound;
  }

  async update(id: string, user: Prisma.UserUpdateInput) {
    const userFound = await this.prisma.user.findUnique({
      where: { id: id },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: id },
      data: user,
    });
  }
}
