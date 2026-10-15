import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateChangeRequestDto {
  @IsString()
  @Length(1, 128)
  recipientId!: string;

  @IsString()
  @Length(1, 2000)
  message!: string;

  @IsOptional()
  @IsBoolean()
  confirmShare?: boolean;
}

export class DecideChangeRequestDto {
  @IsInt()
  @Min(0)
  revision!: number;

  @IsIn(['accept', 'cancel', 'further'])
  action!: 'accept' | 'cancel' | 'further';

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  message?: string;
}
