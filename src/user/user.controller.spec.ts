import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UserController', () => {
  let controller: UserController;
  let userService: { create: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    userService = { create: jest.fn(), update: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes the authenticated actor to create and update', async () => {
    const actor = { sub: 'actor-1' };
    await controller.create(actor as any, { name: 'New' } as any);
    await controller.update('target-1', actor as any, { name: 'Updated' } as any);

    expect(userService.create).toHaveBeenCalledWith({ name: 'New' }, 'actor-1');
    expect(userService.update).toHaveBeenCalledWith('target-1', { name: 'Updated' }, 'actor-1');
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
