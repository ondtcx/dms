import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/role.enum';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  //@Public()
  @Get()
  //@Roles(Role.Admin)
  async findAll() {
    return this.userService.findAllUsers();
  }

  @Get(':cuid')
  async findOne(@Param('cuid') cuid: string) {
    return this.userService.findById(cuid);
  }

  @Post()
  async create(@Body() body: CreateUserDto) {
    return this.userService.create(body);
  }

  @Patch(':cuid')
  async updatePartial(
    @Param('cuid') cuid: string,
    @Body()
    data: UpdateUserDto,
  ) {
    return this.userService.update(cuid, data);
  }

  @Delete(':id')
  remove(): string {
    return 'Deleting a user';
  }

  @Put(':id')
  update(): string {
    return 'Updating a user';
  }
}
