import { Body, Controller, Get, Param, ParseIntPipe, Post, Patch } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/permission.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

@Controller('roles')
@RequirePermission('roles.manage')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  findAll() { return this.roles.findAll(); }

  @Post()
  create(@Body() dto: CreateRoleDto) { return this.roles.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) { return this.roles.update(id, dto); }

  @Post(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number) { return this.roles.deactivate(id); }

  @Post(':id/assign/:userId')
  assign(@Param('id', ParseIntPipe) id: number, @Param('userId') userId: string) { return this.roles.assign(id, userId); }

  @Post(':id/unassign/:userId')
  unassign(@Param('id', ParseIntPipe) id: number, @Param('userId') userId: string) { return this.roles.removeAssignment(id, userId); }
}
