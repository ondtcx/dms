import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class ResourceSharingDto {
  @IsString()
  @Length(1, 128)
  userId!: string;

  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  canUploadVersion?: boolean;

  @IsOptional()
  @IsBoolean()
  canShare?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class DirectoryVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
