import { Module } from '@nestjs/common';
import { AuthorizationService } from '../auth/compatibility/authorization.service';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

@Module({
  controllers: [RoleController],
  providers: [RoleService, PrismaService, AuthorizationService, PermissionGuard],
  exports: [RoleService, AuthorizationService],
})
export class RoleModule {}
