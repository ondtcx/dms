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
import { SignInDto } from './dto/signin.dto';
import { SignUpDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(@Body() data: SignInDto) {
    return this.authService.signIn(data.email, data.password);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('register')
  async signUp(@Body() data: SignUpDto) {
    return this.authService.signUp(data.name, data.email, data.password);
  }

  //@Public()
  @Post('roles')
  //TODO: add type to createRoleDto and createdby user
  async createRole(@Body() createRoleDto: Record<string, any>) {
    return this.authService.createRole(createRoleDto.name);
  }

  @Get('roles')
  async findAllRoles() {
    return this.authService.findAllRoles();
  }

  //@UseGuards(AuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
