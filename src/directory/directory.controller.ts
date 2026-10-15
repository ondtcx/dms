import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateDirectoryDto } from './dto/create-directory.dto';
import { AccessibleDirectoryQueryDto } from './dto/accessible-directory-query.dto';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { RecordDirectoryVisitDto } from './dto/record-directory-visit.dto';
import { UpdateDirectoryDto } from './dto/update-directory.dto';
import { DirectoryService } from './directory.service';
import { ConfigureReceptionDirectoryDto } from './dto/configure-reception-directory.dto';
import { DirectoryParticipantDto, DirectoryDelegateDto } from './dto/manage-directory-membership.dto';
import { SearchDirectoryRecipientsDto } from './dto/search-directory-recipients.dto';
import { ResourceSharingDto, DirectoryVisibilityDto } from './dto/manage-directory-sharing.dto';

@ApiTags('directories')
@ApiBearerAuth('JWT-auth')
@Controller('directories')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Obtener el resumen de navegación de directorios' })
  getNavigationSummary(@CurrentUser() user: any) {
    return this.directoryService.getNavigationSummary(user);
  }

  @Get('accessible')
  @ApiOperation({ summary: 'Listar directorios accesibles con paginación' })
  getAccessible(@Query() query: AccessibleDirectoryQueryDto, @CurrentUser() user: any) {
    return this.directoryService.getAccessibleDirectories(query.page, query.limit, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar directorios del nivel actual' })
  findChildren(@Query() query: QueryDirectoryDto, @CurrentUser() user: any) {
    return this.directoryService.findChildren(query.parentId, user);
  }

  @Post(':id/visits')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar una visita deliberada a un directorio' })
  async recordVisit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordDirectoryVisitDto,
    @CurrentUser() user: any,
  ) {
    await this.directoryService.recordVisit(id, dto.eventId, user);
  }

  @Get(':id/breadcrumb')
  @ApiOperation({ summary: 'Obtener la ruta de navegación de un directorio' })
  getBreadcrumb(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.directoryService.getBreadcrumb(id, user);
  }

  @Get(':id/reception')
  getReception(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.directoryService.getReception(id, user);
  }

  @Patch(':id/reception')
  configureReception(@Param('id', ParseIntPipe) id: number, @Body() dto: ConfigureReceptionDirectoryDto, @CurrentUser() user: any) {
    return this.directoryService.configureReception(id, dto, user);
  }

  @Get(':id/reception/membership')
  getMembership(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.directoryService.getMembership(id, user);
  }

  @Post(':id/reception/participants')
  setParticipant(@Param('id', ParseIntPipe) id: number, @Body() dto: DirectoryParticipantDto, @CurrentUser() user: any) {
    return this.directoryService.setParticipant(id, dto, user);
  }

  @Delete(':id/reception/participants/users/:userId')
  removeUserParticipant(@Param('id', ParseIntPipe) id: number, @Param('userId') target: string, @CurrentUser() user: any) {
    return this.directoryService.removeParticipant(id, 'user', target, user);
  }

  @Delete(':id/reception/participants/roles/:roleId')
  removeRoleParticipant(@Param('id', ParseIntPipe) id: number, @Param('roleId', ParseIntPipe) target: number, @CurrentUser() user: any) {
    return this.directoryService.removeParticipant(id, 'role', target, user);
  }

  @Patch(':id/reception/delegates/:userId')
  setDelegate(@Param('id', ParseIntPipe) id: number, @Param('userId') target: string, @Body() dto: DirectoryDelegateDto, @CurrentUser() user: any) {
    return this.directoryService.setDelegate(id, target, dto, user);
  }

  @Delete(':id/reception/delegates/:userId')
  removeDelegate(@Param('id', ParseIntPipe) id: number, @Param('userId') target: string, @CurrentUser() user: any) {
    return this.directoryService.removeDelegate(id, target, user);
  }

  @Get(':id/reception/recipients/users')
  searchUsers(@Param('id', ParseIntPipe) id: number, @Query() query: SearchDirectoryRecipientsDto, @CurrentUser() user: any) {
    return this.directoryService.searchRecipients(id, 'users', query, user);
  }

  @Get(':id/reception/recipients/roles')
  searchRoles(@Param('id', ParseIntPipe) id: number, @Query() query: SearchDirectoryRecipientsDto, @CurrentUser() user: any) {
    return this.directoryService.searchRecipients(id, 'roles', query, user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un directorio' })
  create(@Body() dto: CreateDirectoryDto, @CurrentUser() user: any) {
    return this.directoryService.create(dto, user);
  }

  @Get(':id/sharing')
  getSharing(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.directoryService.getSharing(id, user);
  }

  @Get(':id/sharing/recipients')
  searchSharingRecipients(@Param('id', ParseIntPipe) id: number, @Query('q') q: string, @CurrentUser() user: any) {
    return this.directoryService.searchSharingRecipients(id, q, user);
  }

  @Post(':id/sharing')
  grantSharing(@Param('id', ParseIntPipe) id: number, @Body() dto: ResourceSharingDto, @CurrentUser() user: any) {
    return this.directoryService.grantSharing(id, dto, user);
  }

  @Delete(':id/sharing/grants/:grantId')
  revokeSharing(@Param('id', ParseIntPipe) id: number, @Param('grantId', ParseIntPipe) grantId: number, @CurrentUser() user: any) {
    return this.directoryService.revokeSharing(id, grantId, user);
  }

  @Patch(':id/sharing/visibility')
  setVisibility(@Param('id', ParseIntPipe) id: number, @Body() dto: DirectoryVisibilityDto, @CurrentUser() user: any) {
    return this.directoryService.setVisibility(id, dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar o reubicar un directorio' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDirectoryDto, @CurrentUser() user: any) {
    return this.directoryService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un directorio vacío' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.directoryService.remove(id, user);
  }
}
