import { IsBoolean, IsInt, IsNotEmpty, IsString, Min, Validate, ValidateIf, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'oneDirectoryRecipient', async: false })
class OneDirectoryRecipient implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const dto = args.object as DirectoryParticipantDto;
    return (dto.userId !== undefined) !== (dto.roleId !== undefined);
  }
  defaultMessage() { return 'Debe indicar exactamente un usuario o un rol'; }
}

export class DirectoryParticipantDto {
  @Validate(OneDirectoryRecipient)
  @ValidateIf((object) => object.userId !== undefined || object.roleId === undefined)
  @IsString()
  @IsNotEmpty()
  userId?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  roleId?: number;

  @IsBoolean()
  peerRead: boolean;
}

// Actualización por reemplazo: las banderas omitidas se guardan como false.
export class DirectoryDelegateDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  full?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  configure?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  manageParticipants?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  readAll?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  review?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  manageDelegates?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  manageStructure?: boolean;
}
