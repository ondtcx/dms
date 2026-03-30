import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationsDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Habilitar envío de notificaciones por email',
  })
  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @ApiPropertyOptional({
    example: 'noreply@colegio.edu',
    description: 'Email del remitente para notificaciones',
  })
  @IsEmail()
  @IsOptional()
  senderEmail?: string;

  @ApiPropertyOptional({
    example: 'Sistema DMS Colegio',
    description: 'Nombre del remitente para notificaciones',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  senderName?: string;
}
