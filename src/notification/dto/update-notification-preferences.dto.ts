import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiProperty()
  @IsBoolean()
  inAppEnabled: boolean;
}
