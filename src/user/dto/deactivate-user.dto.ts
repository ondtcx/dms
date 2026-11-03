import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeactivateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
