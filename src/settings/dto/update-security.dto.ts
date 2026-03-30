import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSecurityDto {
  @ApiPropertyOptional({
    example: 480,
    description: 'Tiempo de sesión en minutos antes de expirar automáticamente',
  })
  @IsInt()
  @IsOptional()
  @Min(5)
  @Max(1440)
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Número máximo de intentos de login fallidos antes de bloquear',
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(20)
  maxLoginAttempts?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Requerir autenticación de dos factores',
  })
  @IsBoolean()
  @IsOptional()
  require2FA?: boolean;
}
