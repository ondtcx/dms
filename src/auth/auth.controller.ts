import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  //UseGuards,
} from '@nestjs/common';
//import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  //TODO: add type to sigInDto
  async signIn(@Body() sigInDto: Record<string, any>) {
    return this.authService.signIn(sigInDto.email, sigInDto.password);
  }

  //@Public()
  @Post('roles')
  //TODO: add type to createRoleDto and createdby user
  async createRole(@Body() createRoleDto: Record<string, any>) {
    return this.authService.createRole(createRoleDto.name);
  }

  //@UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
