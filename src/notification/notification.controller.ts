import { Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationService } from './notification.service';

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

  @Patch(':id/read')
  read(@CurrentUser() actor: any, @Param('id', ParseIntPipe) id: number) {
    return this.notifications.read(actor.id, id);
  }
}
