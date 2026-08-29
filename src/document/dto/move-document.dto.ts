import { ApiProperty } from '@nestjs/swagger';
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { Transform } from 'class-transformer';

function IsPresentIntegerOrNull(validationOptions?: ValidationOptions) {
  return (target: object, propertyKey: string) => {
    registerDecorator({
      name: 'isPresentIntegerOrNull',
      target: target.constructor,
      propertyName: propertyKey,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (!Object.prototype.hasOwnProperty.call(args.object, args.property)) return false;
          return value === null || (typeof value === 'number' && Number.isInteger(value));
        },
      },
    });
  };
}

export class MoveDocumentDto {
  @ApiProperty({ description: 'ID del directorio destino; null mueve el documento a la raíz', nullable: true, example: 4 })
  @IsPresentIntegerOrNull({ message: 'directoryId debe ser un entero o null' })
  @Transform(({ value }) => value === null ? null : (value === '' ? undefined : Number(value)))
  directoryId!: number | null;
}
