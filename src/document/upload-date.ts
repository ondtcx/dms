import { BadRequestException } from '@nestjs/common';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export function calendarDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('La fecha de calendario no es válida');
  }
  return date;
}

@ValidatorConstraint({ name: 'calendarDate', async: false })
export class IsCalendarDate implements ValidatorConstraintInterface {
  validate(value: unknown) {
    try {
      calendarDate(value);
      return true;
    } catch {
      return false;
    }
  }
  defaultMessage() {
    return 'La fecha debe ser válida y tener el formato YYYY-MM-DD';
  }
}

export function uploadDay(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (name: string) =>
    parts.find((item) => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function periodDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function inferAcademicYear(
  day: string,
  years: { id: number; startDate: Date; endDate: Date }[],
) {
  const matches = years.filter(
    (year) =>
      periodDay(year.startDate) <= day && day <= periodDay(year.endDate),
  );
  return {
    academicYearId: matches.length === 1 ? matches[0].id : null,
    warning:
      matches.length === 1
        ? undefined
        : matches.length === 0
          ? 'No hay un año lectivo para la fecha del documento. Se cargó sin año lectivo.'
          : 'La fecha corresponde a varios años lectivos. Se cargó sin año lectivo.',
  };
}
