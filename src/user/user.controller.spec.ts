import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rejects role changes in the self-profile DTO', async () => {
    const errors = await validate(
      plainToInstance(UpdateMyProfileDto, { name: 'Usuario', role: 'admin' }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors.some((error) => error.property === 'role')).toBe(true);
  });

  it('keeps role editing available in the admin update DTO', async () => {
    const errors = await validate(
      plainToInstance(UpdateUserDto, { role: 'admin' }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

    expect(errors).toHaveLength(0);
  });
});
