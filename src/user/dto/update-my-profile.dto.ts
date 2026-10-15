import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateMyProfileDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'role'] as const),
) {}
