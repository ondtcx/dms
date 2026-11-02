import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../auth/compatibility/authorization.service';

@Module({
  imports: [],
  controllers: [UserController],
  providers: [UserService, PrismaService, AuthorizationService],
  exports: [UserService],
})
export class UserModule {}
