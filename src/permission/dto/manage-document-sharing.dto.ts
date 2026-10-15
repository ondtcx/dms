import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { UserRole } from '../../auth/role.enum';
import { ResourceSharingDto } from '../../directory/dto/manage-directory-sharing.dto';

export class ManageDocumentSharingDto extends ResourceSharingDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  grantId?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  comment?: string;
}

export class DocumentVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}

// Compatibilidad de lectura con destinatarios por rol, sin enlaces ni delegación.
export class LegacyDocumentShareDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  userId?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  roleKey?: string;

  @IsOptional()
  @IsBoolean()
  canView?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
