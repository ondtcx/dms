import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUser() actor: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.notifications.list(actor.id, page === undefined ? 1 : Number(page), limit === undefined ? 20 : Number(limit));
  }

  @Get('preferences')
  getPreferences(@CurrentUser() actor: any) {
    return this.notifications.getPreferences(actor.id);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() actor: any,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(actor.id, dto.inAppEnabled);
  }

  @Patch('read-all')
  readAll(@CurrentUser() actor: any) {
    return this.notifications.readAll(actor.id);
  }

  @Patch(':id/read')
  read(@CurrentUser() actor: any, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.read(actor.id, id);
  }
}
