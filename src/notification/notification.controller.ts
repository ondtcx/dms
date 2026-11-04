import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  NotificationService,
  type NotificationFilter,
} from './notification.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { Body } from '@nestjs/common';

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentUser() actor: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    const normalized: NotificationFilter =
      filter === 'unread' || filter === 'read' ? filter : 'all';
    return this.notifications.list(
      actor.id,
      page === undefined ? 1 : Number(page),
      limit === undefined ? 20 : Number(limit),
      normalized,
    );
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

  @Delete('read')
  @HttpCode(HttpStatus.OK)
  archiveRead(@CurrentUser() actor: any) {
    return this.notifications.archiveRead(actor.id);
  }

  @Patch(':id/read')
  read(@CurrentUser() actor: any, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.read(actor.id, id);
  }

  @Patch(':id/unread')
  unread(@CurrentUser() actor: any, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.unread(actor.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  archive(@CurrentUser() actor: any, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.archive(actor.id, id);
  }
}
