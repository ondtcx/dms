import { Allow, IsIn, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { retentionOverride } from '../document-version-retention';

@ValidatorConstraint({ name: 'versionRetentionPayload', async: false })
class VersionRetentionPayload implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    try {
      retentionOverride(args.object as UpdateVersionRetentionDto);
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage(): string {
    return 'La conservación requiere un modo válido y una fecha ISO futura solo para el modo hasta';
  }
}

export class UpdateVersionRetentionDto {
  @ApiProperty({ enum: ['normal', 'permanent', 'until'], description: 'Modo de conservación de la versión' })
  @IsIn(['normal', 'permanent', 'until'], { message: 'El modo de conservación no es válido' })
  @Validate(VersionRetentionPayload)
  mode: 'normal' | 'permanent' | 'until';

  @ApiPropertyOptional({ format: 'date-time', description: 'Fecha ISO futura, obligatoria únicamente en el modo hasta' })
  @Allow()
  preserveUntil?: string;
}
