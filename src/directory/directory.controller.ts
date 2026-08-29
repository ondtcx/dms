import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateDirectoryDto } from './dto/create-directory.dto';
import { AccessibleDirectoryQueryDto } from './dto/accessible-directory-query.dto';
import { QueryDirectoryDto } from './dto/query-directory.dto';
import { RecordDirectoryVisitDto } from './dto/record-directory-visit.dto';
import { UpdateDirectoryDto } from './dto/update-directory.dto';
import { DirectoryService } from './directory.service';

@ApiTags('directories')
@ApiBearerAuth('JWT-auth')
@Controller('directories')
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

  @Post()
  @ApiOperation({ summary: 'Crear un directorio' })
  create(@Body() dto: CreateDirectoryDto, @CurrentUser() user: any) {
    return this.directoryService.create(dto, user);
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
