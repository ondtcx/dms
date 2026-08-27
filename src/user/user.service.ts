import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

const userProjection = {
  id: true,
  email: true,
  name: true,
  role: true,
  authRevision: true,
  phoneNumber: true,
  position: true,
  createdAt: true,
  updatedAt: true,
  roleAssignments: {
    select: { role: { select: { id: true, key: true, label: true, isActive: true } } },
  },
} as const;

function toUserProjection<T extends { roleAssignments?: { role: unknown }[] }>(user: T) {
  const { roleAssignments, ...projection } = user;
  return { ...projection, catalogRoles: (roleAssignments ?? []).map(({ role }) => role) };
}

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(user: CreateUserDto): Promise<Omit<User, 'password'>> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);

    const newUser = await this.prisma.user.create({
      data: {
        ...user,
        password: hashedPassword,
      },
    });

    const { password, ...result } = newUser;

    return result;
  }

  async findAll(): Promise<Omit<User, 'password'>[]> {
    const users = await this.prisma.user.findMany({ select: userProjection });
    return users.map(toUserProjection) as Omit<User, 'password'>[];
  }

  async findAllForSelection(
    excludeUserId?: string,
  ): Promise<{ id: string; name: string; email: string }[]> {
    return this.prisma.user.findMany({
      where: excludeUserId ? { id: { not: excludeUserId } } : undefined,
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
  }

  async findById(id: string): Promise<Omit<User, 'password'>> {
    const userFound = await this.prisma.user.findUnique({ where: { id }, select: userProjection });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return toUserProjection(userFound) as Omit<User, 'password'>;
  }

  async findByEmail(email: string): Promise<any> {
    const userFound = await this.prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRevision: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
        password: true,
        roleAssignments: {
          select: { role: { select: { id: true, key: true, label: true, isActive: true } } },
        },
      },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return toUserProjection(userFound);
  }

  async update(
    id: string,
    user: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    await this.findById(id); // Check if user exists

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: user,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        authRevision: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findById(id); // Check if user exists

    await this.prisma.user.delete({
      where: { id },
    });

    return {
      message: 'User deleted successfully',
    };
  }
}
