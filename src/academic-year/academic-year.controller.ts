import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AcademicYearService } from './academic-year.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('academic-years')
@ApiBearerAuth('JWT-auth')
@Controller('academic-years')
export class AcademicYearController {
  constructor(private readonly academicYearService: AcademicYearService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los años lectivos' })
  findAll() {
    return this.academicYearService.findAll();
  }

  // IMPORTANTE: declarado antes de /:id para evitar conflicto de rutas
  @Get('current')
  @ApiOperation({ summary: 'Obtener el año lectivo actual' })
  @ApiResponse({ status: 200, description: 'Año lectivo actual o null si no hay ninguno' })
  findCurrent() {
    return this.academicYearService.findCurrent();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un año lectivo por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.academicYearService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Crear nuevo año lectivo' })
  @ApiResponse({ status: 201, description: 'Año lectivo creado exitosamente' })
  create(@Body() dto: CreateAcademicYearDto) {
    return this.academicYearService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Actualizar un año lectivo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAcademicYearDto) {
    return this.academicYearService.update(id, dto);
  }

  @Patch(':id/set-current')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar un año lectivo como el actual' })
  setCurrent(@Param('id', ParseIntPipe) id: number) {
    return this.academicYearService.setCurrent(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar un año lectivo (no puede ser el actual ni tener documentos activos)' })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.academicYearService.deactivate(id);
  }
}
