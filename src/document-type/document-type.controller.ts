import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/role.enum';

@ApiTags('document-types')
@ApiBearerAuth('JWT-auth')
@Controller('document-types')
export class DocumentTypeController {
  constructor(private readonly documentTypeService: DocumentTypeService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Crear un nuevo subtipo de documento' })
  @ApiResponse({ status: 201, description: 'Subtipo creado correctamente' })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un subtipo con ese nombre en la categoría',
  })
  create(@Body() dto: CreateDocumentTypeDto) {
    return this.documentTypeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los subtipos de documento' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Filtrar por categoría',
  })
  @ApiResponse({ status: 200, description: 'Lista de subtipos' })
  findAll(@Query('categoryId') categoryId?: string) {
    return this.documentTypeService.findAll(
      categoryId ? +categoryId : undefined,
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar subtipos activos' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Filtrar por categoría',
  })
  @ApiResponse({ status: 200, description: 'Lista de subtipos activos' })
  findActive(@Query('categoryId') categoryId?: string) {
    return this.documentTypeService.findActive(
      categoryId ? +categoryId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un subtipo de documento por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Subtipo encontrado' })
  @ApiResponse({ status: 404, description: 'Subtipo no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.documentTypeService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTOR)
  @ApiOperation({ summary: 'Actualizar un subtipo de documento' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Subtipo actualizado correctamente',
  })
  @ApiResponse({ status: 404, description: 'Subtipo no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentTypeDto,
  ) {
    return this.documentTypeService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un subtipo de documento' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Subtipo eliminado correctamente' })
  @ApiResponse({
    status: 400,
    description:
      'No se puede eliminar por tener documentos/plantillas asociadas',
  })
  @ApiResponse({ status: 404, description: 'Subtipo no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.documentTypeService.remove(id);
  }
}
