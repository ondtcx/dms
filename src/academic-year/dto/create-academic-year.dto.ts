import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  Matches,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { IsCalendarDate } from '../../document/upload-date';

@ValidatorConstraint({ name: 'isStartBeforeEnd', async: false })
class IsStartBeforeEnd implements ValidatorConstraintInterface {
  validate(startDate: string, args: ValidationArguments) {
    const dto = args.object as CreateAcademicYearDto;
    if (!dto.endDate || !startDate) return true;
    return new Date(startDate) <= new Date(dto.endDate);
  }

  defaultMessage() {
    return 'La fecha de inicio no puede ser posterior a la fecha de fin';
  }
}

export class CreateAcademicYearDto {
  @ApiProperty({
    example: '2025-2026',
    description: 'Nombre del año lectivo en formato YYYY-YYYY',
  })
  @IsString()
  @Matches(/^\d{4}-\d{4}$/, {
    message: 'El nombre debe tener el formato YYYY-YYYY (ej: 2025-2026)',
  })
  name: string;

  @ApiProperty({
    example: '2025-03-01',
    description: 'Fecha de inicio del año lectivo',
  })
  @Validate(IsCalendarDate)
  @Validate(IsStartBeforeEnd)
  startDate: string;

  @ApiProperty({
    example: '2026-02-28',
    description: 'Fecha de fin del año lectivo',
  })
  @Validate(IsCalendarDate)
  endDate: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Si el año lectivo está activo',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Si true, desactiva isCurrent en todos los demás años automáticamente',
  })
  @IsBoolean()
  @IsOptional()
  isCurrent?: boolean;
}
