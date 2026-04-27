import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';

export type UserWithoutPassword = Omit<User, 'password'> & { role?: Role | null };

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async create(user: CreateUserDto): Promise<UserWithoutPassword> {
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
      include: { role: true },
    });

    const { password, ...result } = newUser;

    return result;
  }

  async findAll(): Promise<UserWithoutPassword[]> {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: true,
        departmentId: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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

  async findById(id: string): Promise<UserWithoutPassword> {
    const userFound = await this.prisma.user.findUnique({
      where: { id: id },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: true,
        departmentId: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return userFound;
  }

  async findByEmail(email: string): Promise<User & { role?: Role | null }> {
    const userFound = await this.prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: true,
        departmentId: true,
        phoneNumber: true,
        position: true,
        createdAt: true,
        updatedAt: true,
        password: true,
      },
    });

    if (!userFound) {
      throw new NotFoundException('User not found');
    }

    return userFound;
  }

  async update(
    id: string,
    user: UpdateUserDto,
  ): Promise<UserWithoutPassword> {
    await this.findById(id); // Check if user exists

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: user,
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: true,
        departmentId: true,
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
