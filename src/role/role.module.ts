import { Module, Global } from '@nestjs/common';
import { RoleService } from './role.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleController } from './role.controller';

@Global()
@Module({
  controllers: [RoleController],
  providers: [RoleService, PrismaService],
  exports: [RoleService],
})
export class RoleModule {}
